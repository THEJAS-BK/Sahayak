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

/// Mic/call toggle that drives a LiveKit voice session end-to-end:
/// requests RECORD_AUDIO permission (mobile), POSTs /api/voice-sessions for a
/// short-lived join token, connects to the room, publishes the local mic, and
/// reflects the agent's speaking state in the UI.
///
/// When [onTranscript] is provided it is invoked for the agent's speech as it
/// is published over the live transcription channel (`lk.transcription`):
/// once per utterance with `isFinal=false` for interim chunks and once more
/// with `isFinal=true` when the utterance is complete.
///
/// All platform-specific code is gated behind `kIsWeb` (no bare `Platform.isX`
/// checks), so this also compiles for web — where it simply skips the
/// permission step.
class VoiceCallControl extends StatefulWidget {
  const VoiceCallControl({super.key, this.onTranscript, this.onSahayakRequest});

  final AgentTranscriptCallback? onTranscript;
  final SahayakRequestCallback? onSahayakRequest;

  @override
  State<VoiceCallControl> createState() => _VoiceCallControlState();
}

class _VoiceCallControlState extends State<VoiceCallControl> {
  CallState _state = CallState.idle;
  Room? _room;
  EventsListener<RoomEvent>? _listener;
  bool _busy = false;

  Future<void> _onToggle() async {
    if (_isInCall || _state == CallState.connecting) {
      await _endCall();
    } else {
      await _startCall();
    }
  }

  bool get _isInCall =>
      _state == CallState.listening || _state == CallState.agentSpeaking;

  Future<void> _startCall() async {
    if (_busy) return;
    _busy = true;
    setState(() => _state = CallState.connecting);

    try {
      if (!kIsWeb) {
        final status = await Permission.microphone.request();
        if (!status.isGranted) {
          if (mounted) setState(() => _state = CallState.disconnected);
          _showMessage('Microphone access is needed to talk to Sahayak');
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

      if (mounted) setState(() => _state = CallState.listening);
    } on ApiException catch (e) {
      _showMessage(e.message);
      await _cleanup();
      if (mounted) setState(() => _state = CallState.disconnected);
    } catch (_) {
      _showMessage('Could not start the voice call. Please try again.');
      await _cleanup();
      if (mounted) setState(() => _state = CallState.disconnected);
    } finally {
      _busy = false;
    }
  }

  Future<void> _endCall() async {
    if (_busy) return;
    _busy = true;
    try {
      await _cleanup();
      if (mounted) setState(() => _state = CallState.disconnected);
    } finally {
      _busy = false;
    }
  }

  /// Disconnects from the room and unsubscribes all listener callbacks.
  Future<void> _cleanup() async {
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
          if (mounted) setState(() => _state = CallState.listening);
        },
      )
      ..on<RoomDisconnectedEvent>(
        (_) async {
          if (mounted) setState(() => _state = CallState.disconnected);
        },
      )
      ..on<ActiveSpeakersChangedEvent>((event) async {
        if (!mounted ||
            _state == CallState.connecting ||
            _state == CallState.idle) {
          return;
        }
        final localIdentity = room.localParticipant?.identity;
        final agentSpeaking =
            event.speakers.any((p) => p.identity != localIdentity);
        setState(() => _state =
            agentSpeaking ? CallState.agentSpeaking : CallState.listening);
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
          widget.onTranscript?.call(text, segment.isFinal);
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
          widget.onSahayakRequest?.call(payload);
        }
      });
  }

  void _showMessage(String message) {
    if (!mounted) return;
    ScaffoldMessenger.of(context)
        .showSnackBar(SnackBar(content: Text(message)));
  }

  @override
  void dispose() {
    // Cleanup is best-effort during teardown.
    unawaited(_cleanup());
    super.dispose();
  }

  (IconData, Color, String) _buttonStyle() {
    switch (_state) {
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
          _StatusLine(state: _state),
          const SizedBox(height: 12),
          ElevatedButton.icon(
            onPressed: _busy ? null : _onToggle,
            style: ElevatedButton.styleFrom(
              backgroundColor: color,
              foregroundColor: Colors.white,
              minimumSize: const Size.fromHeight(54),
              disabledBackgroundColor: color.withValues(alpha: 0.6),
            ),
            icon: _state == CallState.connecting
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
