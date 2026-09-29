import '../models/help_request.dart';
import 'api_client.dart';
import 'image_type.dart';

/// Volunteer-facing calls against the real backend.
///
/// Endpoints (all require an authenticated, active volunteer):
///   Q-04  GET   /api/requests/nearby?lat&lng&radius_m
///   Q-02  GET   /api/requests/me
///   Q-03  GET   /api/requests/:id
///   Q-05  PATCH /api/requests/:id/accept
///   Q-06  PATCH /api/requests/:id/status  { IN_PROGRESS | COMPLETED }
///   L-02  PATCH /api/volunteers/me/availability { is_available }
class RequestsService {
  /// Public for test doubles; the app uses [instance].
  RequestsService();

  static RequestsService get instance => _override ?? _default;
  static final RequestsService _default = RequestsService();
  static RequestsService? _override;

  /// Test seam — point the app at a fake request source.
  // ignore: use_setters_to_change_properties
  static set overrideForTest(RequestsService? service) => _override = service;

  /// DISPATCHED requests inside the volunteer's dispatch batch, nearest
  /// first.  Senior identity is intentionally absent until the volunteer
  /// accepts (BR-09).
  Future<List<HelpRequest>> nearby({
    required double latitude,
    required double longitude,
    int radiusMeters = 5000,
  }) async {
    final query = Uri(queryParameters: {
      'lat': latitude.toString(),
      'lng': longitude.toString(),
      'radius_m': radiusMeters.toString(),
    }).query;
    final data = await ApiClient.instance.get('/api/requests/nearby?$query');
    return _list(data, 'requests');
  }

  /// Requests currently assigned to the signed-in volunteer (Q-02).
  Future<List<HelpRequest>> mine() async {
    final data = await ApiClient.instance.get('/api/requests/me');
    return _list(data, 'requests');
  }

  /// Full detail for a request.  For a volunteer this only succeeds once the
  /// request is assigned to them, which is when the senior's contact details
  /// become visible.
  Future<HelpRequest> detail(String requestId) async {
    final data = await ApiClient.instance.get('/api/requests/$requestId');
    final request = data['request'];
    if (request is! Map<String, dynamic>) {
      throw const ApiException(
        code: 'MALFORMED_RESPONSE',
        message: 'Request detail missing from server response',
      );
    }
    return HelpRequest.fromJson(request);
  }

  /// Q-05 — first accept wins; the server rejects a second volunteer.
  Future<void> accept(String requestId) =>
      ApiClient.instance.patch('/api/requests/$requestId/accept');

  /// Q-05b — turn down a request that was offered to this volunteer.
  ///
  /// Recorded server-side, so the request stops reappearing in the nearby list
  /// on the next refresh. It stays dispatched for other volunteers and the
  /// senior is not told, because nothing has failed yet.
  Future<void> decline(String requestId, {String? reason}) =>
      ApiClient.instance.patch('/api/requests/$requestId/decline', body: {
        if (reason != null && reason.isNotEmpty) 'reason': reason,
      });

  /// Q-06 — ACCEPTED -> IN_PROGRESS -> COMPLETED.
  Future<void> setStatus(String requestId, HelpRequestStatus status) {
    final wire = switch (status) {
      HelpRequestStatus.inProgress => 'IN_PROGRESS',
      HelpRequestStatus.completed => 'COMPLETED',
      _ => throw ArgumentError('status must be IN_PROGRESS or COMPLETED'),
    };
    return ApiClient.instance
        .patch('/api/requests/$requestId/status', body: {'status': wire});
  }

  /// Q-07 — the senior who raised it can stand it down, but only before a
  /// volunteer has accepted. The server rejects this with 409 once accepted.
  Future<void> cancel(String requestId) =>
      ApiClient.instance.patch('/api/requests/$requestId/cancel');

  /// Q-09 — attach (or replace) the photo on a request the senior owns.
  ///
  /// [filePath] is a local file, normally straight from `image_picker`. The
  /// backend streams it to Cloudinary and stores only the URL, so nothing but
  /// the URL comes back: [uploadPhoto] returns it, and it also rides along as
  /// `image_url` on every later read of the request.
  ///
  /// Throws [ApiException] with `PHOTO_TOO_LARGE` over 5 MB or
  /// `UNSUPPORTED_IMAGE_TYPE` for anything that is not a JPEG/PNG/WebP. The
  /// image is optional, so callers should treat a failure here as a warning
  /// rather than rolling back the request that was already created.
  Future<String> uploadPhoto(
    String requestId,
    String filePath, {
    String? mimeType,
  }) async {
    final resolved = resolveImageMimeType(
      filePath,
      declaredMimeType: mimeType,
    );
    if (resolved == null) {
      throw const ApiException(
        code: 'UNSUPPORTED_IMAGE_TYPE',
        message: 'That photo is not a JPEG, PNG or WebP image',
      );
    }

    final data = await ApiClient.instance.postMultipart(
      '/api/requests/$requestId/photo',
      field: 'photo',
      filePath: filePath,
      mimeType: resolved,
    );

    final photo = data['photo'];
    final url = photo is Map<String, dynamic>
        ? photo['image_url']?.toString()
        : null;
    if (url == null || url.isEmpty) {
      throw const ApiException(
        code: 'MALFORMED_RESPONSE',
        message: 'Upload succeeded but no image URL came back',
      );
    }
    return url;
  }

  /// L-02 — accepting a request requires the volunteer to be available.
  Future<void> setAvailability(bool available) => ApiClient.instance.patch(
        '/api/volunteers/me/availability',
        body: {'is_available': available},
      );

  /// Q-08 — the assigned volunteer's contact details, for the senior who owns
  /// the request.
  ///
  /// Deliberately a separate call from [detail]: the phone number is only
  /// released once a volunteer is actually assigned (BR-08), and only to the
  /// owning senior. Asking for it up front would just draw a 403 on every
  /// request that nobody has taken yet.
  Future<VolunteerContact?> volunteerContact(String requestId) async {
    try {
      final data =
          await ApiClient.instance.get('/api/requests/$requestId/volunteer');
      final volunteer = data['volunteer'];
      if (volunteer is! Map<String, dynamic>) return null;
      return VolunteerContact.fromJson(volunteer);
    } on ApiException catch (e) {
      // Not an error worth surfacing: the usual cause is simply that nobody
      // has accepted yet, which the caller already knows from the status.
      if (e.statusCode == 403 || e.code == 'REQUEST_NOT_ACTIVE') return null;
      rethrow;
    }
  }

  List<HelpRequest> _list(Map<String, dynamic> data, String key) {
    final raw = data[key];
    if (raw is! List) return const [];
    return raw
        .whereType<Map<String, dynamic>>()
        .map(HelpRequest.fromJson)
        .toList();
  }
}

/// The volunteer helping a senior, as returned by Q-08.
class VolunteerContact {
  final String fullName;
  final String phoneNumber;
  final String? organization;
  final List<String> skills;

  const VolunteerContact({
    required this.fullName,
    required this.phoneNumber,
    this.organization,
    this.skills = const [],
  });

  factory VolunteerContact.fromJson(Map<String, dynamic> json) {
    final rawSkills = json['skills'];
    return VolunteerContact(
      fullName: (json['full_name'] ?? '').toString(),
      phoneNumber: (json['phone_number'] ?? '').toString(),
      organization: json['organization']?.toString(),
      skills: rawSkills is List
          ? rawSkills.map((e) => e.toString()).where((e) => e.isNotEmpty).toList()
          : const [],
    );
  }

  /// `+919876543210` for `tel:` — `tel:` needs the value to be dialable.
  String get dialNumber {
    final digits = phoneNumber.replaceAll(RegExp(r'[^0-9+]'), '');
    return digits.isEmpty ? phoneNumber : digits;
  }
}
