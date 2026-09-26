import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/material.dart';
import 'package:livekit_client/livekit_client.dart';
import 'package:permission_handler/permission_handler.dart';

import '../services/api_client.dart';
import '../theme/app_theme.dart';

/// Visual states for the voice call mic button.
enum CallState { idle, connecting, listening, agentSpeaking, disconnected }

/// Agent speech transcription callback. `isFinal == false` means the text is a
/// live (interim) token stream for the utterance currently being spoken.
typedef AgentTranscriptCallback = void Function(String text, bool isFinal);

/// Topic the livekit agent publishes structured help requests on.
const String kSahayakRequestTopic = 'sahayak_request';

/// A structured help request published by the agent over the data channel.
typedef SahayakRequestCallback = void Function(Map<String, dynamic> request);

/// Non-UI engine that drives a LiveKit voice session end-to-end:
/// requests RECORD_AUDIO permission (mobile), POSTs /api/voice-sessions for a
/// short-lived join token, connects to the room, publishes the local mic and
/// reflects the agent's speaking state in [state].
///
/// The agent's speech arrives via [AgentTranscriptCallback] over the live
/// transcription channel (`lk.transcription`) — once per utterance with
/// `isFinal=false` interim chunks and a final `isFinal=true`. Structured help
/// requests come over the data channel topic [kSahayakRequestTopic].
///
/// Exposes [start] / [stop] so any UI (the chat screen's mic button, or the
/// bundled [VoiceCallControl] widget) can drive the same call.
class VoiceCallController extends ChangeNotifier {
  VoiceCallController({
    AgentTranscriptCallback? onTranscript,
    SahayakRequestCallback? onSahayakRequest,
    void Function(String message)? onMessage,
  })  : _onTranscript = onTranscript,
        _onSahayakRequest = onSahayakRequest,
        _onMessage = onMessage;

  final AgentTranscriptCallback? _onTranscript;
  final SahayakRequestCallback? _onSahayakRequest;
  final void Function(String message)? _onMessage;

  CallState _state = CallState.idle;
  bool _busy = false;

  Room? _room;
  EventsListener<RoomEvent>? _listener;

  /// Current call state. Listen via [Listenable] to react to changes.
  CallState get state => _state;

  /// True while a connect/disconnect operation is in flight.
  bool get isBusy => _busy;

  /// True when the mic is live and the agent may be speaking.
  bool get isInCall =>
      _state == CallState.listening || _state == CallState.agentSpeaking;

  /// Toggles the call: starts it if idle/ended, ends it while in a call
  /// (or while connecting).
  Future<void> toggle() async {
    if (_busy) return;
    if (isInCall || _state == CallState.connecting) {
      await stop();
    } else {
      await start();
    }
  }

  /// Requests mic permission, fetches a room token, connects and enables the
  /// local microphone.
  Future<void> start() async {
    if (_busy || isInCall) return;
    _busy = true;
    _state = CallState.connecting;
    notifyListeners();

    try {
      if (!kIsWeb) {
        final status = await Permission.microphone.request();
        if (!status.isGranted) {
          _onMessage?.call('Microphone access is needed to talk to Sahayak');
          await _teardown();
          _state = CallState.disconnected;
          notifyListeners();
          return;
        }
      }

      final session = await ApiClient.instance.post('/api/voice-sessions');
      final url = session['url']?.toString() ?? '';
      final token = session['token']?.toString() ?? '';
      if (url.isEmpty || token.isEmpty) {
        throw const ApiException(
            code: 'INVALID_RESPONSE',
            message: 'Voice session response was incomplete');
      }

      final room = Room();
      _room = room;
      _attachListeners(room);

      await room.connect(url, token);
      await room.localParticipant?.setMicrophoneEnabled(true);

      _state = CallState.listening;
    } on ApiException catch (e) {
      _onMessage?.call(e.message);
      await _teardown();
      _state = CallState.disconnected;
    } catch (_) {
      _onMessage?.call('Could not start the voice call. Please try again.');
      await _teardown();
      _state = CallState.disconnected;
    } finally {
      _busy = false;
      notifyListeners();
    }
  }

  /// Turns the local microphone on or off without ending the call.
  ///
  /// Used while a senior is reading a request summary: the agent keeps the room
  /// but stops hearing them. No-op when there is no live room.
  Future<void> setMicrophoneEnabled(bool enabled) async {
    final participant = _room?.localParticipant;
    if (participant == null) return;
    try {
      await participant.setMicrophoneEnabled(enabled);
    } catch (_) {
      _onMessage?.call(enabled
          ? 'Could not turn the microphone back on.'
          : 'Could not mute the microphone.');
    }
  }

  /// Ends the call and disconnects from the room.
  Future<void> stop() async {
    if (_busy) return;
    _busy = true;
    try {
      await _teardown();
      _state = CallState.disconnected;
    } finally {
      _busy = false;
      notifyListeners();
    }
  }

  /// Disconnects from the room and unsubscribes all listener callbacks.
  Future<void> _teardown() async {
    try {
      await _listener?.dispose();
    } catch (_) {}
    _listener = null;

    final room = _room;
    _room = null;
    if (room != null) {
      try {
        await room.disconnect();
        await room.dispose();
      } catch (_) {}
    }
  }

  void _attachListeners(Room room) {
    final listener = room.createListener();
    _listener = listener;
    listener
      ..on<RoomConnectedEvent>(
        (_) async {
          _state = CallState.listening;
          notifyListeners();
        },
      )
      ..on<RoomDisconnectedEvent>(
        (_) async {
          _state = CallState.disconnected;
          notifyListeners();
        },
      )
      ..on<ActiveSpeakersChangedEvent>((event) async {
        if (_state == CallState.connecting || _state == CallState.idle) {
          return;
        }
        final localIdentity = room.localParticipant?.identity;
        final agentSpeaking =
            event.speakers.any((p) => p.identity != localIdentity);
        _state =
            agentSpeaking ? CallState.agentSpeaking : CallState.listening;
        notifyListeners();
      })
      ..on<TranscriptionEvent>((event) async {
        if (event.participant.identity == room.localParticipant?.identity) {
          return;
        }
        for (final segment in event.segments) {
          final text = segment.text.trim();
          if (text.isEmpty) {
            continue;
          }
          _onTranscript?.call(text, segment.isFinal);
        }
      })
      ..on<DataReceivedEvent>((event) async {
        if (event.topic != kSahayakRequestTopic) return;
        dynamic payload;
        try {
          payload = jsonDecode(utf8.decode(event.data));
        } catch (_) {
          return;
        }
        if (payload is Map<String, dynamic>) {
          _onSahayakRequest?.call(payload);
        }
      });
  }

  @override
  void dispose() {
    // Cleanup is best-effort during teardown.
    unawaited(_teardown());
    super.dispose();
  }
}

/// Mic/call button wired to a [VoiceCallController].
///
/// Convenience widget for embedding a ready-made voice control; screens with
/// their own mic button can instead drive a [VoiceCallController] directly.
class VoiceCallControl extends StatefulWidget {
  const VoiceCallControl({
    super.key,
    this.onTranscript,
    this.onSahayakRequest,
    this.controller,
  });

  final AgentTranscriptCallback? onTranscript;
  final SahayakRequestCallback? onSahayakRequest;

  /// Optional externally-owned controller. If omitted the widget manages one.
  final VoiceCallController? controller;

  @override
  State<VoiceCallControl> createState() => _VoiceCallControlState();
}

class _VoiceCallControlState extends State<VoiceCallControl> {
  late final VoiceCallController _controller;
  late final bool _ownsController;

  VoiceCallController get _voice =>
      widget.controller ?? _controller;

  @override
  void initState() {
    super.initState();
    _ownsController = widget.controller == null;
    _controller = widget.controller ??
        VoiceCallController(
          onTranscript: widget.onTranscript,
          onSahayakRequest: widget.onSahayakRequest,
          onMessage: _showMessage,
        );
    _voice.addListener(_onVoiceChanged);
  }

  void _onVoiceChanged() {
    if (mounted) setState(() {});
  }

  @override
  void didUpdateWidget(covariant VoiceCallControl oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.controller != widget.controller) {
      oldWidget.controller?.removeListener(_onVoiceChanged);
      widget.controller?.addListener(_onVoiceChanged);
      setState(() {});
    }
  }

  void _showMessage(String message) {
    if (!mounted) return;
    ScaffoldMessenger.of(context)
        .showSnackBar(SnackBar(content: Text(message)));
  }

  @override
  void dispose() {
    _voice.removeListener(_onVoiceChanged);
    if (_ownsController) _controller.dispose();
    super.dispose();
  }

  (IconData, Color, String) _buttonStyle() {
    switch (_voice.state) {
      case CallState.connecting:
        return (Icons.sync, AppTheme.postRegistration, 'Connecting...');
      case CallState.listening:
        return (
          Icons.stop_circle_outlined,
          AppTheme.postRegistration,
          'Tap to end the call'
        );
      case CallState.agentSpeaking:
        return (
          Icons.stop_circle_outlined,
          AppTheme.senior,
          'Tap to end the call'
        );
      case CallState.disconnected:
        return (Icons.mic_none, AppTheme.senior, 'Call ended — start again');
      case CallState.idle:
        return (Icons.mic, AppTheme.senior, 'Start voice call');
    }
  }

  @override
  Widget build(BuildContext context) {
    final (icon, color, label) = _buttonStyle();
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          _StatusLine(state: _voice.state),
          const SizedBox(height: 12),
          ElevatedButton.icon(
            onPressed: _voice.isBusy ? null : () => _voice.toggle(),
            style: ElevatedButton.styleFrom(
              backgroundColor: color,
              foregroundColor: Colors.white,
              minimumSize: const Size.fromHeight(54),
              disabledBackgroundColor: color.withValues(alpha: 0.6),
            ),
            icon: _voice.state == CallState.connecting
                ? const SizedBox(
                    width: 20,
                    height: 20,
                    child: CircularProgressIndicator(
                        strokeWidth: 2, color: Colors.white),
                  )
                : Icon(icon),
            label: Text(label,
                style:
                    const TextStyle(fontSize: 16, fontWeight: FontWeight.w600)),
          ),
        ],
      ),
    );
  }
}

class _StatusLine extends StatelessWidget {
  const _StatusLine({required this.state});

  final CallState state;

  @override
  Widget build(BuildContext context) {
    final (widget, text) = switch (state) {
      CallState.idle => (
          const Icon(Icons.mic_none, size: 20, color: Colors.grey),
          'Tap to start talking to Sahayak'
        ),
      CallState.connecting => (
          const Icon(Icons.sync, size: 20, color: AppTheme.postRegistration),
          'Connecting to the voice assistant...',
        ),
      CallState.listening => (
          const Icon(Icons.hearing, size: 20, color: AppTheme.postRegistration),
          'Listening — go ahead and speak',
        ),
      CallState.agentSpeaking => (
          const Icon(Icons.graphic_eq, size: 20, color: AppTheme.senior),
          'Agent is speaking...',
        ),
      CallState.disconnected => (
          const Icon(Icons.call_end, size: 20, color: Colors.grey),
          'Call ended'
        ),
    };

    return Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        widget,
        const SizedBox(width: 8),
        Text(text, style: const TextStyle(fontSize: 15, color: Colors.black87)),
      ],
    );
  }
}
