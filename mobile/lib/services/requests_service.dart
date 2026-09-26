import '../models/help_request.dart';
import 'api_client.dart';

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

  /// L-02 — accepting a request requires the volunteer to be available.
  Future<void> setAvailability(bool available) => ApiClient.instance.patch(
        '/api/volunteers/me/availability',
        body: {'is_available': available},
      );

  List<HelpRequest> _list(Map<String, dynamic> data, String key) {
    final raw = data[key];
    if (raw is! List) return const [];
    return raw
        .whereType<Map<String, dynamic>>()
        .map(HelpRequest.fromJson)
        .toList();
  }
}
