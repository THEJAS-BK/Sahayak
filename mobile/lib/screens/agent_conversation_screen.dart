import 'package:flutter/material.dart';

import '../services/agent_service.dart';
import '../services/api_client.dart';
import '../theme/app_colors.dart';
import '../widgets/chat_bubble.dart';
import '../widgets/text_input_bar.dart';
import '../widgets/voice_call.dart';

/// Voice-based agent conversation screen.
///
/// The big mic button drives a real LiveKit voice call via
/// [VoiceCallController]: it POSTs `/api/voice-sessions` for a room token,
/// connects to the room and streams the agent's speech back as transcript
/// [ChatBubble]s. When the agent records a help request it is published over
/// the `sahayak_request` data channel, which this screen forwards to
/// `POST /api/requests`.
///
/// The text input below is an independent fallback that talks to the
/// `/api/agent/chat` endpoint (may not be live yet) and surfaces a friendly
/// error via [_showError].
class AgentConversationScreen extends StatefulWidget {
  const AgentConversationScreen({super.key});

  @override
  State<AgentConversationScreen> createState() =>
      _AgentConversationScreenState();
}

class _AgentConversationScreenState extends State<AgentConversationScreen> {
  // ── Services ─────────────────────────────────────────────────────────────
  late final VoiceCallController _voice;
  final AgentService _agentService = AgentService();

  // ── State ─────────────────────────────────────────────────────────────────
  ConversationState _convState = ConversationState.idle;

  /// Voice-call helper banner (permission errors, session failures, ...).
  String? _voiceHelperText;

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
    _voice = VoiceCallController(
      onTranscript: _onAgentTranscript,
      onSahayakRequest: _onSahayakRequest,
      onMessage: _showError,
    )..addListener(_onVoiceChanged);
    // Seed with greeting
    _messages = [
      Message(
        text: 'Hello! How can I help you today?',
        role: MessageRole.agent,
        timestamp: DateTime.now(),
      ),
    ];
  }

  void _onVoiceChanged() {
    if (!mounted) return;
    setState(() {
      _convState = switch (_voice.state) {
        CallState.connecting => ConversationState.transcribing,
        CallState.listening ||
        CallState.agentSpeaking =>
          ConversationState.listening,
        CallState.idle || CallState.disconnected => ConversationState.idle,
      };
    });
  }

  // ── LiveKit voice flow ────────────────────────────────────────────────────

  Future<void> _onMicTap() async {
    setState(() => _errorMessage = null);
    await _voice.toggle();
  }

  /// Streams the agent's transcribed speech into the transcript list.
  /// Interim (`isFinal == false`) chunks replace the trailing agent bubble so
  /// the text fills in live; the final chunk locks it in place.
  void _onAgentTranscript(String text, bool isFinal) {
    if (!mounted) return;
    setState(() {
      if (_messages.isNotEmpty && _messages.last.isAgent) {
        final last = _messages.last;
        _messages[_messages.length - 1] = last.copyWith(text: text);
      } else {
        _messages.add(Message(
          text: text,
          role: MessageRole.agent,
          timestamp: DateTime.now(),
        ));
      }
    });
    _scrollToBottom();
  }

  /// The agent published a structured help request over the data channel —
  /// forward it to the backend on the senior's behalf.
  Future<void> _onSahayakRequest(Map<String, dynamic> request) async {
    if (!mounted) return;
    try {
      await ApiClient.instance.post('/api/requests', body: request);
      if (!mounted) return;
      setState(() {
        _messages.add(Message(
          text: 'Got it — your request is recorded. A volunteer will be in '
              'touch shortly.',
          role: MessageRole.agent,
          timestamp: DateTime.now(),
        ));
      });
      _scrollToBottom();
    } on ApiException catch (e) {
      _showError('Could not submit your request: ${e.message}');
    } catch (_) {
      _showError('Could not submit your request. Please try again.');
    }
  }

  // ── Text fallback flow ────────────────────────────────────────────────────

  Future<void> _onSend() async {
    final text = _textCtrl.text.trim();
    if (text.isEmpty) return;

    _textCtrl.clear();
    setState(() {
      _convState = ConversationState.awaitingReply;
      _errorMessage = null;
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
    _voice.removeListener(_onVoiceChanged);
    _voice.dispose();
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
    final isListening = _convState == ConversationState.listening;

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
                  // Voice-session helper text (permission / errors)
                  if (_voiceHelperText != null)
                    Padding(
                      padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
                      child: Text(
                        _voiceHelperText!,
                        textAlign: TextAlign.center,
                        style: const TextStyle(
                          fontSize: 12,
                          color: AppColors.textSecondary,
                        ),
                      ),
                    ),

                  // Mic button — drives the LiveKit voice call
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
                    hintText: isListening
                        ? 'Listening… speak now'
                        : 'Or type a message…',
                    helperText: null,
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