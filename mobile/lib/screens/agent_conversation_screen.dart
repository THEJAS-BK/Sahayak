import 'package:flutter/material.dart';
import 'package:speech_to_text/speech_to_text.dart' as stt;
import 'package:permission_handler/permission_handler.dart';

import '../services/agent_service.dart';
import '../theme/app_colors.dart';
import '../widgets/chat_bubble.dart';
import '../widgets/text_input_bar.dart';

/// Voice-based agent conversation screen.
///
/// Supports both voice input (on-device STT via [speech_to_text]) and
/// freeform text input.  Both paths share the same [AgentService] instance
/// and conversation history.
///
/// The backend `/api/agent/chat` endpoint is not yet live; any network call
/// will surface a user-friendly error banner with a Retry button.
class AgentConversationScreen extends StatefulWidget {
  const AgentConversationScreen({super.key});

  @override
  State<AgentConversationScreen> createState() =>
      _AgentConversationScreenState();
}

class _AgentConversationScreenState extends State<AgentConversationScreen> {
  // ── Services ─────────────────────────────────────────────────────────────
  final AgentService _agentService = AgentService();
  final stt.SpeechToText _speech = stt.SpeechToText();

  // ── State ─────────────────────────────────────────────────────────────────
  ConversationState _convState = ConversationState.idle;
  bool _speechAvailable = false;

  /// Populated when STT fails so the UI shows a helper banner.
  String? _sttHelperText;

  /// Non-null when there is an error to display in the error banner.
  String? _errorMessage;

  // ── Text input ─────────────────────────────────────────────────────────────
  final TextEditingController _textCtrl = TextEditingController();
  final FocusNode _textFocus = FocusNode();
  final ScrollController _scrollCtrl = ScrollController();

  // ── Conversation history snapshot (updated after each send) ───────────────
  List<Message> _messages = [];

  @override
  void initState() {
    super.initState();
    _initSpeech();
    // Seed with greeting
    _messages = [
      Message(
        text: 'Hello! How can I help you today?',
        role: MessageRole.agent,
        timestamp: DateTime.now(),
      ),
    ];
  }

  Future<void> _initSpeech() async {
    _speechAvailable = await _speech.initialize(
      onError: (e) => _onSttError(e.errorMsg),
      onStatus: (status) {
        if (status == 'done' || status == 'notListening') {
          _onSttDone();
        }
      },
    );
    if (mounted) setState(() {});
  }

  // ── Voice flow ─────────────────────────────────────────────────────────────

  Future<void> _onMicTap() async {
    // Clear error banner on any new interaction
    setState(() => _errorMessage = null);

    if (_convState == ConversationState.listening) {
      await _stopListening();
      return;
    }

    // Request mic permission
    final status = await Permission.microphone.request();
    if (!status.isGranted) {
      _showError('Microphone permission denied. '
          'Please enable it in Settings to use voice input.');
      return;
    }

    if (!_speechAvailable) {
      setState(() {
        _sttHelperText =
            "Couldn't hear you — voice recognition is not available on this "
            "device. Type your message below.";
      });
      return;
    }

    setState(() {
      _convState = ConversationState.listening;
      _sttHelperText = null;
      _textCtrl.clear();
    });

    await _speech.listen(
      onResult: (result) {
        _textCtrl.text = result.recognizedWords;
        // Move cursor to end
        _textCtrl.selection = TextSelection.fromPosition(
          TextPosition(offset: _textCtrl.text.length),
        );
      },
      listenOptions: stt.SpeechListenOptions(
        listenFor: const Duration(seconds: 30),
        pauseFor: const Duration(seconds: 3),
        partialResults: true,
        localeId: 'en_US',
      ),
    );
  }

  Future<void> _stopListening() async {
    await _speech.stop();
    setState(() => _convState = ConversationState.transcribing);
    // Give the result callback a frame to fire before transitioning
    await Future.delayed(const Duration(milliseconds: 200));
    if (mounted) {
      setState(() {
        _convState = ConversationState.idle;
        if (_textCtrl.text.isEmpty) {
          _sttHelperText =
              "Couldn't hear you — type your message below.";
        }
      });
    }
  }

  void _onSttDone() {
    if (_convState == ConversationState.listening && mounted) {
      _stopListening();
    }
  }

  void _onSttError(String msg) {
    if (!mounted) return;
    setState(() {
      _convState = ConversationState.idle;
      _sttHelperText =
          'Voice recognition error — type your message below.\n($msg)';
    });
  }

  // ── Send flow ──────────────────────────────────────────────────────────────

  Future<void> _onSend() async {
    final text = _textCtrl.text.trim();
    if (text.isEmpty) return;

    _textCtrl.clear();
    _sttHelperText = null;
    setState(() {
      _convState = ConversationState.awaitingReply;
      _errorMessage = null;
      // Append user message immediately (service does the same internally)
      _messages = [
        ..._agentService.history,
        Message(
          text: text,
          role: MessageRole.user,
          timestamp: DateTime.now(),
        ),
      ];
    });
    _scrollToBottom();

    // Add pending agent bubble
    final pendingIdx = _agentService.addPendingAgent();
    setState(() {
      _messages = List.from(_agentService.history);
    });
    _scrollToBottom();

    try {
      final reply = await _agentService.sendText(text);
      _agentService.resolvePendingAgent(pendingIdx, reply);
    } on AgentServiceException catch (e) {
      _agentService.removePendingAgent(pendingIdx);
      _showError(e.message);
    } catch (e) {
      _agentService.removePendingAgent(pendingIdx);
      _showError('An unexpected error occurred: $e');
    } finally {
      if (mounted) {
        setState(() {
          _convState = ConversationState.idle;
          _messages = List.from(_agentService.history);
        });
        _scrollToBottom();
      }
    }
  }

  void _showError(String msg) {
    if (!mounted) return;
    setState(() => _errorMessage = msg);
  }

  void _scrollToBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scrollCtrl.hasClients) {
        _scrollCtrl.animateTo(
          _scrollCtrl.position.maxScrollExtent,
          duration: const Duration(milliseconds: 300),
          curve: Curves.easeOut,
        );
      }
    });
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  @override
  void dispose() {
    _speech.stop();
    _agentService.dispose();
    _textCtrl.dispose();
    _textFocus.dispose();
    _scrollCtrl.dispose();
    super.dispose();
  }

  // ── Build ──────────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    final isBusy = _convState == ConversationState.awaitingReply ||
        _convState == ConversationState.transcribing;

    return Scaffold(
      backgroundColor: AppColors.scaffold,
      appBar: AppBar(
        backgroundColor: AppColors.navyDark,
        elevation: 0,
        // ← Back arrow — takes the senior back to the dashboard
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_ios_new_rounded,
              color: Colors.white, size: 20),
          tooltip: 'Back to Dashboard',
          onPressed: () => Navigator.of(context).pop(),
        ),
        title: const Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              'Sahayak',
              style: TextStyle(
                color: Colors.white,
                fontSize: 17,
                fontWeight: FontWeight.w700,
              ),
            ),
            Text(
              'Talk to Sahayak',
              style: TextStyle(
                color: Color(0xFF94A3B8),
                fontSize: 11,
              ),
            ),
          ],
        ),
        // "Dashboard" pill button on the right
        actions: [
          Padding(
            padding: const EdgeInsets.only(right: 12),
            child: TextButton.icon(
              onPressed: () => Navigator.of(context).pop(),
              icon: const Icon(Icons.home_rounded,
                  color: Colors.white, size: 18),
              label: const Text(
                'Dashboard',
                style: TextStyle(
                  color: Colors.white,
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                ),
              ),
              style: TextButton.styleFrom(
                backgroundColor: Colors.white.withAlpha(30),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(20),
                  side: BorderSide(
                      color: Colors.white.withAlpha(60), width: 1),
                ),
                padding:
                    const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                minimumSize: Size.zero,
                tapTargetSize: MaterialTapTargetSize.shrinkWrap,
              ),
            ),
          ),
        ],
      ),
      body: SafeArea(
        child: Column(
          children: [
            // ── Error banner ────────────────────────────────────────────
            if (_errorMessage != null) _ErrorBanner(
              message: _errorMessage!,
              onRetry: () {
                setState(() => _errorMessage = null);
                // Re-focus text field so user can easily type or retry
                _textFocus.requestFocus();
              },
              onDismiss: () => setState(() => _errorMessage = null),
            ),

            // ── Transcript area ─────────────────────────────────────────
            Expanded(
              child: _messages.isEmpty
                  ? const Center(
                      child: Text(
                        'Conversation will appear here.',
                        style: TextStyle(color: AppColors.textSecondary),
                      ),
                    )
                  : ListView.separated(
                      controller: _scrollCtrl,
                      padding: const EdgeInsets.all(16),
                      itemCount: _messages.length,
                      separatorBuilder: (_, __) =>
                          const SizedBox(height: 10),
                      itemBuilder: (_, i) =>
                          ChatBubble(message: _messages[i]),
                    ),
            ),

            // ── Mic + input panel ───────────────────────────────────────
            Container(
              color: AppColors.cardWhite,
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  // Mic button
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 20),
                    child: MicButton(
                      state: _convState,
                      onTap: _onMicTap,
                    ),
                  ),

                  // Text input bar (always visible)
                  TextInputBar(
                    controller: _textCtrl,
                    focusNode: _textFocus,
                    onSend: isBusy ? () {} : _onSend,
                    isBusy: isBusy,
                    hintText: _convState == ConversationState.listening
                        ? 'Listening… speak now'
                        : 'Or type a message…',
                    helperText: _sttHelperText,
                  ),
                  const Padding(
                    padding: EdgeInsets.fromLTRB(16, 0, 16, 12),
                    child: Text(
                      'Feeling done? Tap Dashboard above to return home.',
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        fontSize: 11,
                        color: AppColors.textSecondary,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ── Error banner ──────────────────────────────────────────────────────────────

class _ErrorBanner extends StatelessWidget {
  const _ErrorBanner({
    required this.message,
    required this.onRetry,
    required this.onDismiss,
  });

  final String message;
  final VoidCallback onRetry;
  final VoidCallback onDismiss;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: AppColors.error.withAlpha(20),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Padding(
              padding: EdgeInsets.only(top: 1),
              child: Icon(
                Icons.error_outline,
                color: AppColors.error,
                size: 18,
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                message,
                style: const TextStyle(
                  fontSize: 12,
                  color: AppColors.textPrimary,
                  height: 1.4,
                ),
              ),
            ),
            const SizedBox(width: 6),
            // Retry
            InkWell(
              onTap: onRetry,
              child: const Padding(
                padding: EdgeInsets.all(4),
                child: Text(
                  'Retry',
                  style: TextStyle(
                    fontSize: 12,
                    color: AppColors.accentBlue,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
            ),
            // Dismiss
            InkWell(
              onTap: onDismiss,
              child: const Padding(
                padding: EdgeInsets.all(4),
                child: Icon(
                  Icons.close,
                  size: 14,
                  color: AppColors.textSecondary,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
