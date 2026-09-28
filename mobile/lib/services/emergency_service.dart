import '../services/api_client.dart';
import '../services/profile_service.dart';

/// E-01 — a senior-triggered SOS event, which notifies the police desk.
///
/// `trigger_type` is the backend enum: a manual SOS tap is the closest match
/// to `keyword_repetition` (an explicit, deliberate distress signal from the
/// app rather than an acoustic or model-inferred one).
class EmergencyService {
  /// Public for test doubles; the app uses [instance].
  EmergencyService();

  static EmergencyService get instance => _override ?? _default;
  static final EmergencyService _default = EmergencyService();
  static EmergencyService? _override;

  /// Test seam — point the app at a fake emergency backend.
  // ignore: use_setters_to_change_properties
  static set overrideForTest(EmergencyService? service) => _override = service;

  Future<String> triggerSos({String? detail}) async {
    // An SOS must go out even if the profile read fails, so the coordinates
    // are best-effort: the event is still logged without them.
    ({double latitude, double longitude})? home;
    try {
      home = (await ProfileService.instance.fetchMe()).homeCoordinates;
    } catch (_) {
      home = null;
    }
    final data = await ApiClient.instance.post('/api/emergency-events', body: {
      'trigger_type': 'keyword_repetition',
      'source': 'flutter_app',
      if (home != null) 'latitude': home.latitude,
      if (home != null) 'longitude': home.longitude,
      if (detail != null && detail.isNotEmpty) 'detail': {'note': detail},
    });
    final event = data['event'];
    return event is Map && event['event_id'] != null
        ? event['event_id'].toString()
        : '';
  }
}
