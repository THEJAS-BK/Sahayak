import 'dart:convert';

/// Non-UI helper for the structured help-request payload the LiveKit voice
/// agent publishes on the `sahayak_request` data channel.
///
/// Contract: see `plans/voice-structured-output.md`. The agent emits a
/// versioned envelope; this class parses it (legacy bare payloads are still
/// accepted) and produces the exact body for `Q-01 POST /api/requests`.
class VoicePayloadException implements Exception {
  const VoicePayloadException(this.message);

  final String message;

  @override
  String toString() => message;
}

/// A parsed, validated help request from the voice agent.
class VoiceHelpRequest {
  const VoiceHelpRequest({
    required this.requestId,
    required this.category,
    required this.description,
    this.priority = 'normal',
    this.details,
  });

  /// Currently expected envelope schema version (agent's PAYLOAD_VERSION).
  static const int payloadVersion = 1;

  /// Envelope schema version marker; absent on legacy payloads.
  final String requestId;
  final String category;
  final String description;
  final String priority;
  final Map<String, dynamic>? details;

  /// Accepts either the v1 envelope
  /// `{ v, type, request_id, request: {...} }` or a bare legacy payload
  /// `{ category, description, priority?, details? }`.
  factory VoiceHelpRequest.fromDataChannel(dynamic payload) {
    if (payload is! Map<String, dynamic>) {
      throw const VoicePayloadException('Agent payload was not an object');
    }

    final version = payload['v'];
    if (version is int && version != payloadVersion) {
      throw VoicePayloadException(
          'Unsupported payload version $version (expected $payloadVersion)');
    }

    final rawRequest = payload['request'];
    if (rawRequest is Map<String, dynamic>) {
      final request = rawRequest;
      final details = request['details'];
      return VoiceHelpRequest(
        requestId: (payload['request_id'] as String?) ?? '',
        category: (request['category'] as String?) ?? '',
        description: (request['description'] as String?) ?? '',
        priority: _priorityOf(request['priority']),
        details: details is Map<String, dynamic> && details.isNotEmpty
            ? details
            : null,
      );
    }

    // Legacy bare payload
    final details = payload['details'];
    return VoiceHelpRequest(
      requestId: '',
      category: (payload['category'] as String?) ?? '',
      description: (payload['description'] as String?) ?? '',
      priority: _priorityOf(payload['priority']),
      details: details is Map<String, dynamic> && details.isNotEmpty
          ? details
          : null,
    );
  }

  /// Returns a copy with the given fields replaced, so a senior can correct the
  /// request in the review dialog before it is sent.
  VoiceHelpRequest copyWith({
    String? category,
    String? description,
    String? priority,
    Map<String, dynamic>? details,
  }) {
    return VoiceHelpRequest(
      requestId: requestId,
      category: category ?? this.category,
      description: description ?? this.description,
      priority: VoiceHelpRequest._priorityOf(priority ?? this.priority),
      details: details ?? this.details,
    );
  }

  static String _priorityOf(dynamic raw) {
    final value = raw?.toString().trim().toLowerCase();
    return value == 'urgent' ? 'urgent' : 'normal';
  }

  RegExp get _categoryRe => RegExp(r'^[a-z0-9_]+$');

  /// True when the payload carries everything the backend needs
  /// (category + description). [requestId] may be empty for legacy payloads.
  bool get isValid =>
      category.isNotEmpty &&
      description.trim().isNotEmpty &&
      _categoryRe.hasMatch(category);

  /// The request body for `Q-01 POST /api/requests`.
  ///
  /// The agent itself has no location context, so the caller must pass the
  /// senior's registered home coordinates (`GET /api/me` ->
  /// `profile.homeLatitude/homeLongitude`).  There is no placeholder default:
  /// a request filed at the wrong location would be matched to the wrong
  /// volunteers.  `source` is forced to `voice_agent`.
  Map<String, dynamic> toCreateBody({
    required double latitude,
    required double longitude,
    String source = 'voice_agent',
  }) {
    return {
      'category': category,
      'description': description.trim(),
      if (details != null && details!.isNotEmpty) 'details': details,
      'latitude': latitude,
      'longitude': longitude,
      'priority': priority,
      'source': source,
    };
  }

  String toJson({required double latitude, required double longitude}) =>
      jsonEncode(toCreateBody(latitude: latitude, longitude: longitude));
}