import 'dart:convert';
import 'package:http/http.dart' as http;

// ── Base URL ──────────────────────────────────────────────────────────────────
// Change this to your backend host when the /api/agent routes are live.
const String _kBaseUrl = 'http://localhost:3000';

// ── Message model ─────────────────────────────────────────────────────────────

enum MessageRole { user, agent }

class Message {
  final String text;
  final MessageRole role;
  final DateTime timestamp;

  /// When [isPending] is true the bubble shows a loading shimmer instead of
  /// [text].  Used for the agent's "in-flight" placeholder.
  final bool isPending;

  const Message({
    required this.text,
    required this.role,
    required this.timestamp,
    this.isPending = false,
  });

  bool get isAgent => role == MessageRole.agent;

  Message copyWith({
    String? text,
    MessageRole? role,
    DateTime? timestamp,
    bool? isPending,
  }) =>
      Message(
        text: text ?? this.text,
        role: role ?? this.role,
        timestamp: timestamp ?? this.timestamp,
        isPending: isPending ?? this.isPending,
      );
}

// ── Typed exception ───────────────────────────────────────────────────────────

class AgentServiceException implements Exception {
  final String message;
  final int? statusCode;

  const AgentServiceException(this.message, {this.statusCode});

  @override
  String toString() => 'AgentServiceException: $message';
}

// ── Service ───────────────────────────────────────────────────────────────────

class AgentService {
  AgentService({http.Client? client}) : _client = client ?? http.Client();

  final http.Client _client;
  final List<Message> _history = [];

  /// Read-only snapshot of the conversation history.
  List<Message> get history => List.unmodifiable(_history);

  /// Send a text message to the backend `/api/agent/chat` endpoint and return
  /// the agent's reply [Message].
  ///
  /// The user message is appended to history before the network call so that
  /// the UI can render it immediately.  A pending agent bubble is NOT added by
  /// this method — the screen manages that itself using [addPendingAgent] /
  /// [resolvePendingAgent].
  Future<Message> sendText(String text) async {
    final userMsg = Message(
      text: text.trim(),
      role: MessageRole.user,
      timestamp: DateTime.now(),
    );
    _history.add(userMsg);

    final uri = Uri.parse('$_kBaseUrl/api/agent/chat');

    try {
      final response = await _client
          .post(
            uri,
            headers: {'Content-Type': 'application/json'},
            body: jsonEncode({
              'message': text.trim(),
              'history': _history
                  .where((m) => !m.isPending)
                  .map((m) => {
                        'role': m.isAgent ? 'assistant' : 'user',
                        'content': m.text,
                      })
                  .toList(),
            }),
          )
          .timeout(const Duration(seconds: 30));

      if (response.statusCode == 200 || response.statusCode == 201) {
        final body = jsonDecode(response.body) as Map<String, dynamic>;
        final replyText = (body['reply'] as String?) ??
            (body['message'] as String?) ??
            'No response from server.';

        final agentMsg = Message(
          text: replyText,
          role: MessageRole.agent,
          timestamp: DateTime.now(),
        );
        _history.add(agentMsg);
        return agentMsg;
      } else if (response.statusCode == 404) {
        throw const AgentServiceException(
          'AI backend not available yet — the /api/agent/chat endpoint is not '
          'implemented on the server. Please try again later or type your '
          'message below.',
          statusCode: 404,
        );
      } else {
        throw AgentServiceException(
          'Server returned ${response.statusCode}: ${response.reasonPhrase}',
          statusCode: response.statusCode,
        );
      }
    } on AgentServiceException {
      rethrow;
    } catch (e) {
      throw AgentServiceException(
        'Could not reach the Sahayak server. '
        'Check your internet connection and try again.\n'
        'Detail: $e',
      );
    }
  }

  /// Add a pending (loading) agent bubble.  Returns the index so the caller
  /// can later call [resolvePendingAgent] to replace it.
  int addPendingAgent() {
    _history.add(Message(
      text: '',
      role: MessageRole.agent,
      timestamp: DateTime.now(),
      isPending: true,
    ));
    return _history.length - 1;
  }

  /// Replace the pending bubble at [index] with the resolved [message].
  void resolvePendingAgent(int index, Message message) {
    if (index >= 0 && index < _history.length) {
      _history[index] = message;
    }
  }

  /// Remove the pending bubble at [index] (used on error).
  void removePendingAgent(int index) {
    if (index >= 0 && index < _history.length) {
      _history.removeAt(index);
    }
  }

  void dispose() => _client.close();
}
