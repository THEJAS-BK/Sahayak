import 'dart:math' as math;

/// Request priority exactly as the backend stores it (`help_requests.priority`).
enum RequestPriority { urgent, normal }

RequestPriority requestPriorityFrom(String? raw) =>
    raw == 'urgent' ? RequestPriority.urgent : RequestPriority.normal;

String requestPriorityLabel(RequestPriority p) =>
    p == RequestPriority.urgent ? 'URGENT' : 'NORMAL';

/// Lifecycle states the backend can report for a help request.
enum HelpRequestStatus {
  pending,
  matching,
  dispatched,
  accepted,
  inProgress,
  completed,
  cancelled,
  unassigned,
}

HelpRequestStatus? helpRequestStatusFrom(String? raw) {
  switch (raw) {
    case 'PENDING':
      return HelpRequestStatus.pending;
    case 'MATCHING':
      return HelpRequestStatus.matching;
    case 'DISPATCHED':
      return HelpRequestStatus.dispatched;
    case 'ACCEPTED':
      return HelpRequestStatus.accepted;
    case 'IN_PROGRESS':
      return HelpRequestStatus.inProgress;
    case 'COMPLETED':
      return HelpRequestStatus.completed;
    case 'CANCELLED':
      return HelpRequestStatus.cancelled;
    case 'UNASSIGNED':
      return HelpRequestStatus.unassigned;
    default:
      return null;
  }
}

String helpRequestStatusLabel(HelpRequestStatus s) {
  switch (s) {
    case HelpRequestStatus.pending:
      return 'PENDING';
    case HelpRequestStatus.matching:
      return 'MATCHING';
    case HelpRequestStatus.dispatched:
      return 'DISPATCHED';
    case HelpRequestStatus.accepted:
      return 'ACCEPTED';
    case HelpRequestStatus.inProgress:
      return 'IN PROGRESS';
    case HelpRequestStatus.completed:
      return 'COMPLETED';
    case HelpRequestStatus.cancelled:
      return 'CANCELLED';
    case HelpRequestStatus.unassigned:
      return 'UNASSIGNED';
  }
}

/// Plain-language status for a senior.
///
/// The wire enum is written for the police console (DISPATCHED, UNASSIGNED) and
/// none of it means anything to the person who asked for help, so the senior
/// screens read this instead. Null — Q-04 omits `status` — falls back to
/// "Sent" rather than showing an empty pill.
String seniorStatusLabel(HelpRequestStatus? status) {
  switch (status) {
    case HelpRequestStatus.pending:
    case HelpRequestStatus.matching:
      return 'Sending your request';
    case HelpRequestStatus.dispatched:
      return 'Looking for a volunteer';
    case HelpRequestStatus.accepted:
      return 'Accepted';
    case HelpRequestStatus.inProgress:
      return 'Volunteer is on the way';
    case HelpRequestStatus.completed:
      return 'Completed';
    case HelpRequestStatus.cancelled:
      return 'Cancelled';
    case HelpRequestStatus.unassigned:
      return 'No volunteer available yet';
    case null:
      return 'Sent';
  }
}

/// A help request as returned by the backend.
///
/// Every field is populated from an API response — nothing here is fixture
/// data. Fields the API omits for a given endpoint stay null:
///
/// * `GET /api/requests/nearby` (Q-04) returns no `status`, no `details` and
///   no senior identity (privacy: BR-09), but it does return `distance_m`.
/// * `GET /api/requests/me` (Q-02) returns the full row for requests assigned
///   to the caller, still without the senior's name/phone.
/// * `GET /api/requests/:id` (Q-03) adds `senior.full_name` /
///   `senior.phone_number`, but only once the caller is the assigned
///   volunteer (the senior's phone is never exposed to unassigned volunteers).
///
/// Q-02 and Q-03 disagree on key casing: Q-02 runs every column through
/// `shapeRow`, which camelCases it (`createdAt`, `acceptedAt`), while Q-03 and
/// Q-04 project snake_case. Both are read here so one model serves all three.
class HelpRequest {
  final String id;
  final String category;
  final String description;
  final HelpRequestStatus? status;
  final RequestPriority priority;
  final DateTime? createdAt;
  final DateTime? acceptedAt;
  final DateTime? completedAt;
  final DateTime? dispatchedAt;
  final double? latitude;
  final double? longitude;
  final double? distanceM;
  final String? source;
  final Map<String, dynamic> details;
  final String? seniorName;
  final String? seniorPhone;
  final String? assignedVolunteerId;
  final String? assignedVolunteerName;

  /// Cloudinary URL of the photo the senior attached, or null if they did not.
  final String? imageUrl;

  const HelpRequest({
    required this.id,
    required this.category,
    required this.description,
    required this.priority,
    this.status,
    this.createdAt,
    this.acceptedAt,
    this.completedAt,
    this.dispatchedAt,
    this.latitude,
    this.longitude,
    this.distanceM,
    this.source,
    this.details = const {},
    this.seniorName,
    this.seniorPhone,
    this.assignedVolunteerId,
    this.assignedVolunteerName,
    this.imageUrl,
  });

  /// True when a photo is attached and worth rendering.
  bool get hasImage => imageUrl != null && imageUrl!.isNotEmpty;

  factory HelpRequest.fromJson(Map<String, dynamic> json) {
    return HelpRequest(
      id: (json['id'] ?? '').toString(),
      category: (json['category'] ?? '').toString(),
      description: (json['description'] ?? '').toString(),
      status: helpRequestStatusFrom(json['status']?.toString()),
      priority: requestPriorityFrom(json['priority']?.toString()),
      createdAt: _date(json['created_at'] ?? json['createdAt']),
      acceptedAt: _date(json['accepted_at'] ?? json['acceptedAt']),
      completedAt: _date(json['completed_at'] ?? json['completedAt']),
      dispatchedAt: _date(json['dispatched_at'] ?? json['dispatchedAt']),
      latitude: _double(json['latitude']),
      longitude: _double(json['longitude']),
      distanceM: _double(json['distance_m']),
      source: json['source']?.toString(),
      details: json['details'] is Map<String, dynamic>
          ? json['details'] as Map<String, dynamic>
          : const {},
      seniorName: _seniorField(json, 'full_name'),
      seniorPhone: _seniorField(json, 'phone_number'),
      assignedVolunteerId: _assignedField(json, 'id') ??
          (json['assigned_volunteer_id'] ?? json['assignedVolunteerId'])?.toString(),
      assignedVolunteerName: _assignedField(json, 'full_name'),
      // Q-02 runs its rows through `shapeRow`, which camelCases every column,
      // so this is the one field that can arrive under either spelling.
      imageUrl: (json['image_url'] ?? json['imageUrl'])?.toString(),
    );
  }

  static String? _seniorField(Map<String, dynamic> json, String key) {
    final senior = json['senior'];
    if (senior is Map && senior[key] != null) return senior[key].toString();
    return null;
  }

  /// Q-02 and Q-03 both expose the assignee as a nested `assigned_volunteer`
  /// object; Q-03 spells the inner key `full_name` in both casings.
  static String? _assignedField(Map<String, dynamic> json, String key) {
    for (final holder in ['assigned_volunteer', 'assignedVolunteer']) {
      final node = json[holder];
      if (node is Map) {
        final value = node[key] ?? node[_camel(key)];
        if (value != null) return value.toString();
      }
    }
    return null;
  }

  static String _camel(String snake) =>
      snake.replaceAllMapped(RegExp(r'_([a-z0-9])'), (m) => m[1]!.toUpperCase());

  static DateTime? _date(Object? raw) =>
      raw == null ? null : DateTime.tryParse(raw.toString())?.toLocal();

  static double? _double(Object? raw) {
    if (raw == null) return null;
    if (raw is num) return raw.toDouble();
    return double.tryParse(raw.toString());
  }

  /// Voice-agent extras (items / symptoms / destination) as short chips.
  List<String> get detailChips {
    final chips = <String>[];
    for (final entry in details.entries) {
      final value = entry.value;
      if (value is List) {
        chips.addAll(value.map((e) => e.toString()).where((e) => e.isNotEmpty));
      } else if (value != null && value.toString().isNotEmpty) {
        chips.add(value.toString());
      }
    }
    return chips;
  }

  /// Coordinates as shown to a volunteer, e.g. `13.1610, 74.8830`.
  String? get coordinateLabel {
    if (latitude == null || longitude == null) return null;
    return '${latitude!.toStringAsFixed(4)}, ${longitude!.toStringAsFixed(4)}';
  }

  /// Distance formatted for display, e.g. `1.2 km` / `640 m`.
  String? get distanceLabel {
    final meters = distanceM;
    if (meters == null) return null;
    if (meters < 1000) return '${meters.round()} m';
    return '${(meters / 1000).toStringAsFixed(1)} km';
  }

  /// Relative age of the request, e.g. `4 min ago`.
  String? get createdLabel {
    final created = createdAt;
    if (created == null) return null;
    final diff = DateTime.now().difference(created);
    if (diff.inSeconds < 60) return 'just now';
    if (diff.inMinutes < 60) return '${diff.inMinutes} min ago';
    if (diff.inHours < 24) return '${diff.inHours} hr ago';
    return '${diff.inDays} d ago';
  }

  HelpRequest copyWith({HelpRequestStatus? status, double? distanceM}) =>
      HelpRequest(
        id: id,
        category: category,
        description: description,
        priority: priority,
        status: status ?? this.status,
        createdAt: createdAt,
        acceptedAt: acceptedAt,
        completedAt: completedAt,
        dispatchedAt: dispatchedAt,
        latitude: latitude,
        longitude: longitude,
        distanceM: distanceM ?? this.distanceM,
        source: source,
        details: details,
        seniorName: seniorName,
        seniorPhone: seniorPhone,
        assignedVolunteerId: assignedVolunteerId,
        assignedVolunteerName: assignedVolunteerName,
        imageUrl: imageUrl,
      );

  /// Great-circle distance in metres between two coordinates.
  static double distanceBetween({
    required double fromLat,
    required double fromLng,
    required double toLat,
    required double toLng,
  }) {
    const earthRadius = 6371000.0;
    double rad(double deg) => deg * math.pi / 180;
    final dLat = rad(toLat - fromLat);
    final dLng = rad(toLng - fromLng);
    final a = math.pow(math.sin(dLat / 2), 2) +
        math.cos(rad(fromLat)) *
            math.cos(rad(toLat)) *
            math.pow(math.sin(dLng / 2), 2);
    return earthRadius * 2 * math.asin(math.min(1.0, math.sqrt(a)));
  }

  // ── Senior-facing status ──────────────────────────────────────────────

  /// True once a volunteer has taken the request, i.e. there is somebody to
  /// thank. Drives the "who accepted it" panel.
  bool get isAccepted =>
      status == HelpRequestStatus.accepted ||
      status == HelpRequestStatus.inProgress ||
      status == HelpRequestStatus.completed;

  /// A volunteer has been asked and nobody has taken it yet.
  bool get isAwaitingVolunteer =>
      status == HelpRequestStatus.dispatched ||
      status == HelpRequestStatus.pending ||
      status == HelpRequestStatus.matching ||
      status == HelpRequestStatus.unassigned;

  /// Still the senior's to stop.
  bool get isCancellable =>
      status == HelpRequestStatus.pending ||
      status == HelpRequestStatus.matching ||
      status == HelpRequestStatus.dispatched;

  /// Headline for the "who is helping" line, e.g. `Ravi accepted your request`.
  /// Null while nobody has accepted — callers show the waiting copy instead.
  String? get acceptedByLabel {
    final name = assignedVolunteerName;
    if (name == null || name.isEmpty) return null;
    if (status == HelpRequestStatus.inProgress) return '$name is on the way';
    if (status == HelpRequestStatus.completed) return 'Helped by $name';
    return '$name accepted your request';
  }

  /// When the volunteer accepted, as `accepted 2:35 pm`, or null.
  String? get acceptedLabel {
    final at = acceptedAt;
    if (at == null) return null;
    final hour = at.hour % 12 == 0 ? 12 : at.hour % 12;
    final minute = at.minute.toString().padLeft(2, '0');
    final meridiem = at.hour < 12 ? 'am' : 'pm';
    return 'accepted $hour:$minute $meridiem';
  }
}
