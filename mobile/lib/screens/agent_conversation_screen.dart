import 'package:flutter/material.dart';

import '../models/message.dart';
import '../services/api_client.dart';
import '../services/profile_service.dart';
import '../services/requests_service.dart';
import '../services/voice_payload.dart';
import '../theme/app_colors.dart';
import '../widgets/chat_bubble.dart';
import '../widgets/mic_button.dart';
import '../widgets/pending_request_card.dart';
import '../widgets/request_review_dialog.dart';
import '../widgets/voice_call.dart';

/// Voice-based agent conversation screen.
///
/// The big mic button drives a real LiveKit voice call via
/// [VoiceCallController]: it POSTs `/api/voice-sessions` for a room token,
/// connects to the room and streams the agent's speech back as transcript
/// [ChatBubble]s. When the agent has gathered a help request it is published
/// over the `sahayak_request` data channel; this screen pauses the microphone
/// and asks the senior to review it. Sending the request from that dialog POSTs
/// `/api/requests`; continuing the conversation leaves it on a pending card
/// that can be reopened later. Typed messages were removed: the backend has no
/// text-chat endpoint, so the voice call is the only conversation channel.
class AgentConversationScreen extends StatefulWidget {
  const AgentConversationScreen({super.key});

  @override
  State<AgentConversationScreen> createState() =>
      _AgentConversationScreenState();
}

class _AgentConversationScreenState extends State<AgentConversationScreen> {
  // ── Services ─────────────────────────────────────────────────────────────
  late final VoiceCallController _voice;

  // ── State ─────────────────────────────────────────────────────────────────
  ConversationState _convState = ConversationState.idle;

  /// Voice-call helper banner (permission errors, session failures, ...).
  String? _voiceHelperText;

  /// Non-null when there is an error to display in the error banner.
  String? _errorMessage;

  /// request_ids already forwarded to the backend (dedupe against re-published
  /// or duplicate data-channel deliveries).
  final Set<String> _seenRequestIds = {};

  /// The request the senior has not sent yet: shown on a pending card and, once
  /// it arrives, in the review dialog.
  VoiceHelpRequest? _pendingRequest;

  /// True while the review dialog is on screen (mutes the mic, blocks a second
  /// dialog).
  bool _reviewOpen = false;

  /// True while the confirmed request is being POSTed.
  bool _sending = false;

  // ── Language ───────────────────────────────────────────────────────────────
  /// Conversation language ('en' or 'kn'): mirrored into the seed greeting and
  /// forwarded to the agent over the `agent_lang` data channel.
  String _language = 'en';

  // ── Text input ─────────────────────────────────────────────────────────────
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
        text: _seedGreeting(_language),
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

  /// The agent published a structured help request over the data channel — parse
  /// the envelope and ask the senior to review it before anything is sent.
  Future<void> _onSahayakRequest(Map<String, dynamic> payload) async {
    if (!mounted) return;

    final VoiceHelpRequest parsed;
    try {
      parsed = VoiceHelpRequest.fromDataChannel(payload);
    } on VoicePayloadException catch (e) {
      _showError('Voice request was invalid: ${e.message}');
      return;
    }
    if (!parsed.isValid) {
      _showError('The voice request was missing a category or description.');
      return;
    }

    // Dedupe re-published / duplicate deliveries.
    if (parsed.requestId.isNotEmpty) {
      if (_seenRequestIds.contains(parsed.requestId)) return;
      _seenRequestIds.add(parsed.requestId);
    }

    setState(() => _pendingRequest = parsed);
    await _presentReview();
  }

  /// Mutes the mic, shows the review dialog for the pending request and acts on
  /// the outcome: send it, or put the microphone back and keep talking.
  Future<void> _presentReview() async {
    final pending = _pendingRequest;
    if (pending == null || _reviewOpen || _sending || !mounted) return;

    setState(() {
      _reviewOpen = true;
      _errorMessage = null;
    });
    await _voice.setMicrophoneEnabled(false);
    if (!mounted) return;

    VoiceHelpRequest? confirmed;
    try {
      confirmed = await showRequestReviewDialog(context, request: pending);
    } finally {
      if (mounted) setState(() => _reviewOpen = false);
    }
    if (!mounted) return;

    // The agent published a newer request while the dialog was open — review
    // that one instead of the stale draft.
    final current = _pendingRequest;
    if (current != null && current.requestId != pending.requestId) {
      await _presentReview();
      return;
    }

    await _voice.setMicrophoneEnabled(true);
    if (confirmed == null) return;

    await _sendRequest(confirmed);
  }

  /// POSTs the confirmed request. The pending card stays put on failure so the
  /// senior can retry from it.
  Future<void> _sendRequest(VoiceHelpRequest request) async {
    setState(() {
      _sending = true;
      _errorMessage = null;
    });

    try {
      // File the request at the senior's registered home location so matching
      // can find volunteers who are actually nearby.
      final me = await ProfileService.instance.fetchMe(force: true);
      final home = me.homeCoordinates;
      if (home == null) {
        throw const ApiException(
          code: 'NO_HOME_LOCATION',
          message: 'Add a home location to your senior profile before '
              'sending a request',
        );
      }
      final res = await ApiClient.instance.post(
        '/api/requests',
        body: request.toCreateBody(
          latitude: home.latitude,
          longitude: home.longitude,
        ),
      );

      // The photo goes up second, now that there is a request id to hang it
      // on. The request itself is already created and dispatched at this
      // point, so an upload failure is reported but never rolls anything back —
      // re-sending the request would trip BR-13 and tell the senior they
      // already have one open.
      final requestId = res['request_id']?.toString();
      final photoWarning = requestId == null
          ? null
          : await _uploadPhoto(requestId, request.imagePath);

      // Dispatch is synchronous, so an empty batch means nobody was in range.
      // Saying "a volunteer will be in touch" regardless would leave the
      // senior waiting on an alert that was never sent to anyone.
      final notified = res['notified'] == true;
      if (!mounted) return;
      setState(() {
        _pendingRequest = null;
        _messages.add(Message(
          text: _sentNotice(request, notified, photoWarning),
          role: MessageRole.agent,
          timestamp: DateTime.now(),
        ));
      });
      _scrollToBottom();
    } on ApiException catch (e) {
      _showError(e.code == 'REQUEST_ALREADY_OPEN'
          ? 'You already have a help request open. A volunteer is on the way.'
          : e.code == 'NO_HOME_LOCATION'
              ? e.message
              : 'Could not send your request: ${e.message}');
    } catch (_) {
      _showError('Could not send your request. Please try again.');
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  void _showError(String msg) {
    if (!mounted) return;
    setState(() => _errorMessage = msg);
  }

  /// Q-09. Returns a warning to append to the "sent" message, or null on
  /// success or when no photo was picked.
  ///
  /// Swallows every failure on purpose: the request is already live and a
  /// volunteer is already being dispatched to it, so the worst case of a failed
  /// upload is a request without a photo, not a lost request.
  Future<String?> _uploadPhoto(String requestId, String? imagePath) async {
    if (imagePath == null || imagePath.isEmpty) return null;
    try {
      await RequestsService.instance.uploadPhoto(requestId, imagePath);
      return null;
    } on ApiException catch (e) {
      return e.code == 'PHOTO_TOO_LARGE'
          ? 'Your photo was too large to send, so it was left off the request.'
          : 'Your photo could not be attached, so it was left off the request.';
    } catch (_) {
      return 'Your photo could not be attached, so it was left off the request.';
    }
  }

  /// The offline greeting text shown before the first agent transcript lands.
  String _seedGreeting(String language) => language == 'kn'
      ? 'ಸ್ವಾಗತ. ನಾನು ನಿಮಗೆ ಹೇಗೆ ಸಹಾಯ ಮಾಡಬಹುದು?'
      : 'Hello! How can I help you today?';

  /// User-facing notice appended after a request is POSTed, in the current
  /// conversation language.
  String _sentNotice(VoiceHelpRequest request, bool notified, [String? photoWarning]) {
    final what = categoryLabel(request.category).toLowerCase();
    final urgent = request.priority == 'urgent';
    if (_language == 'kn') {
      final sent = notified
          ? 'ಕಳುಹಿಸಲಾಗಿದೆ — $what ಸಹಾಯ'
              '${urgent ? ' (ತುರ್ತು)' : ''} ವಿನಂತಿಸಲಾಗಿದೆ. '
              'ಸ್ವಯಂಸೇವಕರು ಶೀಘ್ರದಲ್ಲೇ ನಿಮ್ಮನ್ನು ಸಂಪರ್ಕಿಸುತ್ತಾರೆ.'
          : 'ಕಳುಹಿಸಲಾಗಿದೆ — $what ಸಹಾಯ'
              '${urgent ? ' (ತುರ್ತು)' : ''} ವಿನಂತಿಸಲಾಗಿದೆ. ಆದರೆ ಈಗ '
              'ಸಮೀಪದಲ್ಲಿ ಯಾವುದೇ ಸ್ವಯಂಸೇವಕರು ಇಲ್ಲ, ಹಾಗಾಗಿ ಯಾರಿಗೂ '
              'ತಿಳಿಸಲಾಗಿಲ್ಲ. ದಯವಿಟ್ಟು ಹೆಲ್ಪ್‌ಲೈನ್‌ಗೆ ಕರೆ ಮಾಡಿ, ಅಥವಾ '
              'ಸ್ವಲ್ಪ ಸಮಯದ ನಂತರ ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.';
      return photoWarning == null ? sent : '$sent $photoWarning';
    }
    final sent = notified
        ? 'Sent — $what help'
            '${urgent ? ' (urgent)' : ''} requested. '
            'A volunteer will be in touch shortly.'
        : 'Sent — $what help'
            '${urgent ? ' (urgent)' : ''} requested. '
            'No volunteers are nearby right now, so nobody has been '
            'notified yet. Please call the helpline, or try again in a '
            'little while.';
    return photoWarning == null ? sent : '$sent $photoWarning';
  }

  /// Applies a language selection and pushes it to the agent. Before the call
  /// starts the seed greeting bubble is swapped to match what the agent will
  /// say when the call (re)starts.
  void _onLanguageSelected(String language) {
    if (language == _language) return;
    setState(() {
      _language = language;
      if (!_voice.isInCall &&
          _convState == ConversationState.idle &&
          _messages.length == 1 &&
          _messages.single.isAgent) {
        _messages[0] = _messages[0].copyWith(text: _seedGreeting(language));
      }
    });
    _voice.setLanguage(language);
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
    _scrollCtrl.dispose();
    super.dispose();
  }

  // ── Build ──────────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
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
            // ── Language toggle ───────────────────────────────────────
            Container(
              color: AppColors.cardWhite,
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
              child: Row(
                children: [
                  const Icon(Icons.translate_rounded,
                      size: 18, color: AppColors.textSecondary),
                  const SizedBox(width: 6),
                  const Text(
                    'Language / ಭಾಷೆ',
                    style: TextStyle(
                      fontSize: 12,
                      color: AppColors.textSecondary,
                    ),
                  ),
                  const Spacer(),
                  SegmentedButton<String>(
                    segments: const [
                      ButtonSegment(value: 'en', label: Text('English')),
                      ButtonSegment(value: 'kn', label: Text('ಕನ್ನಡ')),
                    ],
                    selected: {_language},
                    showSelectedIcon: false,
                    style: const ButtonStyle(
                      visualDensity: VisualDensity.compact,
                      textStyle: WidgetStatePropertyAll(
                        TextStyle(
                            fontSize: 13, fontWeight: FontWeight.w600),
                      ),
                    ),
                    onSelectionChanged: (selection) =>
                        _onLanguageSelected(selection.first),
                  ),
                ],
              ),
            ),

            // ── Error banner ────────────────────────────────────────────
            if (_errorMessage != null) _ErrorBanner(
              message: _errorMessage!,
              onRetry: () => setState(() => _errorMessage = null),
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

                  // Request the senior has not sent yet — tap to reopen review
                  if (_pendingRequest != null)
                    PendingRequestCard(
                      request: _pendingRequest!,
                      onReview: _sending ? () {} : _presentReview,
                    ),

                  // Mic button — drives the LiveKit voice call
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 20),
                    child: MicButton(
                      state: _convState,
                      onTap: _onMicTap,
                    ),
                  ),

                  Padding(
                    padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
                    child: Text(
                      isListening
                          ? 'Listening — speak now.'
                          : 'Feeling done? Tap Dashboard above to return home.',
                      textAlign: TextAlign.center,
                      style: const TextStyle(
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