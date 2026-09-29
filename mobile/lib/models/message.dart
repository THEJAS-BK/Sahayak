import 'dart:typed_data';

/// One transcript bubble in the agent conversation.
enum MessageRole { user, agent }

class Message {
  final String text;
  final MessageRole role;
  final DateTime timestamp;

  /// When [isPending] is true the bubble shows a loading shimmer instead of
  /// [text].  Used for the agent's "in-flight" placeholder.
  final bool isPending;

  /// Optional image attached by the user. Rendered as an inline image when
  /// present instead of [text].
  final Uint8List? imageBytes;

  const Message({
    required this.text,
    required this.role,
    required this.timestamp,
    this.isPending = false,
    this.imageBytes,
  });

  bool get isAgent => role == MessageRole.agent;

  Message copyWith({
    String? text,
    MessageRole? role,
    DateTime? timestamp,
    bool? isPending,
    Uint8List? imageBytes,
  }) =>
      Message(
        text: text ?? this.text,
        role: role ?? this.role,
        timestamp: timestamp ?? this.timestamp,
        isPending: isPending ?? this.isPending,
        imageBytes: imageBytes ?? this.imageBytes,
      );
}
