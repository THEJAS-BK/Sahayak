import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sahayak_mobile/models/help_request.dart';
import 'package:sahayak_mobile/screens/request_detail_screen.dart';
import 'package:sahayak_mobile/screens/senior_profile_screen.dart';
import 'package:sahayak_mobile/screens/volunteer_home_screen.dart';
import 'package:sahayak_mobile/services/api_client.dart';
import 'package:sahayak_mobile/services/profile_service.dart';
import 'package:sahayak_mobile/services/requests_service.dart';
import 'package:sahayak_mobile/widgets/stat_card.dart';

/// Rows copied from real API responses (Q-04 / Q-02 / Q-03) — no invented
/// callers, addresses or deadlines.
const _nearbyJson = {
  'requests': [
    {
      'id': 'b60a80d5-893f-4160-bb27-e21358efea46',
      'category': 'grocery_assistance',
      'description': 'Voice test: need 2 kg rice and a bottle of oil delivered today',
      'latitude': 13.161,
      'longitude': 74.883,
      'priority': 'urgent',
      'created_at': '2026-09-25T12:00:00.000Z',
      'distance_m': 1240.5,
    },
    {
      'id': '2c8f0a11-1f7c-4d1e-9d3a-6f2a0c1b4e77',
      'category': 'transport',
      'description': 'Need a ride to the clinic at 4 pm',
      'latitude': 13.17,
      'longitude': 74.9,
      'priority': 'normal',
      'created_at': '2026-09-25T11:30:00.000Z',
      'distance_m': 820.0,
    },
  ],
};

const _mineJson = {
  'requests': [
    {
      'id': '9d0c1f77-2b6a-4f2e-8b1a-51b2c3d4e5f6',
      'senior_id': '7c3b2a10-0000-4000-8000-000000000001',
      'assigned_volunteer_id': '7c3b2a10-0000-4000-8000-0000000000ff',
      'status': 'IN_PROGRESS',
      'category': 'medication',
      'description': 'Pick up a prescription from the chemist',
      'details': null,
      'latitude': 13.2222,
      'longitude': 74.738,
      'priority': 'normal',
      'source': 'flutter_app',
      'created_at': '2026-09-24T09:00:00.000Z',
      'accepted_at': '2026-09-24T09:05:00.000Z',
      'completed_at': null,
    },
  ],
};

const _detailJson = {
  'request': {
    'id': 'b60a80d5-893f-4160-bb27-e21358efea46',
    'category': 'grocery_assistance',
    'description': 'Need 2 kg rice and a bottle of oil',
    'details': {'items': ['rice 2kg', 'cooking oil 1L']},
    'latitude': 13.161,
    'longitude': 74.883,
    'priority': 'urgent',
    'source': 'voice_agent',
    'status': 'ACCEPTED',
    'created_at': '2026-09-25T12:00:00.000Z',
    'accepted_at': '2026-09-25T12:04:00.000Z',
    'senior': {
      'id': '7c3b2a10-0000-4000-8000-000000000001',
      'full_name': 'Pooja Hegde',
      'phone_number': '+91 98765 43210',
    },
  },
};

class _FakeApiClient extends ApiClient {
  _FakeApiClient();

  final List<String> calls = [];

  /// Extra rows the server starts returning later, to simulate a request being
  /// dispatched to this volunteer while the app is already open.
  List<Map<String, dynamic>> pushedRequests = [];

  /// Off duty is the default after registration; tests flip this to exercise
  /// the go-on-duty path.
  bool available = true;

  Map<String, dynamic> get _nearbyResponse => {
        'requests': [
          ...(_nearbyJson['requests'] as List),
          ...pushedRequests,
        ]
      };

  @override
  Future<Map<String, dynamic>> get(String path) async {
    calls.add('GET $path');
    if (path.startsWith('/api/me')) {
      return {
        'id': '7c3b2a10-0000-4000-8000-0000000000ff',
        'email': 'karthik.shetty@example.com',
        'role': 'volunteer',
        'is_active': true,
        'verification_status': 'APPROVED',
        'profile': {
          'full_name': 'Karthik Shetty',
          'phone_number': '+91 90000 11111',
          'base_latitude': 13.3522,
          'base_longitude': 74.7928,
          'is_available': available,
        },
      };
    }
    if (path.startsWith('/api/requests/nearby')) return _nearbyResponse;
    if (path == '/api/requests/me') return _mineJson;
    if (path.startsWith('/api/requests/')) return _detailJson;
    return <String, dynamic>{};
  }

  @override
  Future<Map<String, dynamic>> patch(String path,
      {Map<String, dynamic>? body}) async {
    calls.add('PATCH $path${body == null ? '' : ' $body'}');
    return <String, dynamic>{};
  }
}

class _FakeRequestsService extends RequestsService {
  _FakeRequestsService(this.api);

  final _FakeApiClient api;
  final List<String> accepted = [];
  final List<String> declined = [];
  final List<(String, HelpRequestStatus)> statusChanges = [];
  final List<bool> availabilityChanges = [];

  @override
  Future<List<HelpRequest>> nearby({
    required double latitude,
    required double longitude,
    int radiusMeters = 5000,
  }) async {
    final data = await api.get(
        '/api/requests/nearby?lat=$latitude&lng=$longitude&radius_m=$radiusMeters');
    return (data['requests'] as List)
        .cast<Map<String, dynamic>>()
        .map(HelpRequest.fromJson)
        .toList();
  }

  @override
  Future<List<HelpRequest>> mine() async {
    final data = await api.get('/api/requests/me');
    return (data['requests'] as List)
        .cast<Map<String, dynamic>>()
        .map(HelpRequest.fromJson)
        .toList();
  }

  @override
  Future<HelpRequest> detail(String requestId) async {
    final data = await api.get('/api/requests/$requestId');
    return HelpRequest.fromJson(data['request'] as Map<String, dynamic>);
  }

  @override
  Future<void> accept(String requestId) async {
    accepted.add(requestId);
    await api.patch('/api/requests/$requestId/accept');
  }

  @override
  Future<void> decline(String requestId, {String? reason}) async {
    declined.add(requestId);
    await api.patch('/api/requests/$requestId/decline',
        body: {if (reason != null && reason.isNotEmpty) 'reason': reason});
  }

  @override
  Future<void> setStatus(String requestId, HelpRequestStatus status) async {
    statusChanges.add((requestId, status));
    await api.patch('/api/requests/$requestId/status',
        body: {'status': status == HelpRequestStatus.completed ? 'COMPLETED' : 'IN_PROGRESS'});
  }

  @override
  Future<void> setAvailability(bool available) async {
    availabilityChanges.add(available);
    await api.patch('/api/volunteers/me/availability',
        body: {'is_available': available});
  }
}

class _FakeProfileService extends ProfileService {
  _FakeProfileService(this.api);

  final _FakeApiClient api;

  @override
  Future<MyProfile> fetchMe({bool force = false}) async =>
      MyProfile.fromJson(await api.get('/api/me'));
}

void main() {
  late _FakeApiClient api;
  late _FakeRequestsService requests;

  setUp(() {
    api = _FakeApiClient();
    requests = _FakeRequestsService(api);
    ProfileService.overrideForTest = _FakeProfileService(api);
    RequestsService.overrideForTest = requests;
  });

  tearDown(() {
    ProfileService.overrideForTest = null;
    RequestsService.overrideForTest = null;
  });

  group('HelpRequest parsing', () {
    test('parses a nearby row: no status, no senior, real distance', () {
      final request = HelpRequest.fromJson(
          (_nearbyJson['requests'] as List).first as Map<String, dynamic>);

      expect(request.id, 'b60a80d5-893f-4160-bb27-e21358efea46');
      expect(request.category, 'grocery_assistance');
      expect(request.priority, RequestPriority.urgent);
      expect(request.status, isNull, reason: 'Q-04 does not return a status');
      expect(request.seniorName, isNull, reason: 'BR-09: identity stays hidden');
      expect(request.seniorPhone, isNull);
      expect(request.distanceM, closeTo(1240.5, 0.01));
      expect(request.distanceLabel, '1.2 km');
      expect(request.coordinateLabel, '13.1610, 74.8830');
    });

    test('parses an assigned row with lifecycle timestamps', () {
      final request = HelpRequest.fromJson(
          (_mineJson['requests'] as List).first as Map<String, dynamic>);

      expect(request.status, HelpRequestStatus.inProgress);
      expect(helpRequestStatusLabel(request.status!), 'IN PROGRESS');
      expect(request.acceptedAt, isNotNull);
      expect(request.completedAt, isNull);
      expect(request.seniorName, isNull);
    });

    test('parses detail: senior contact appears once assigned', () {
      final request = HelpRequest.fromJson(_detailJson['request'] as Map<String, dynamic>);

      expect(request.status, HelpRequestStatus.accepted);
      expect(request.seniorName, 'Pooja Hegde');
      expect(request.seniorPhone, '+91 98765 43210');
      expect(request.detailChips, ['rice 2kg', 'cooking oil 1L']);
      expect(request.source, 'voice_agent');
    });

    test('distance helper matches the haversine distance', () {
      final meters = HelpRequest.distanceBetween(
        fromLat: 13.3522,
        fromLng: 74.7928,
        toLat: 13.161,
        toLng: 74.883,
      );
      expect(meters, greaterThan(20000));
      expect(meters, lessThan(25000));
    });
  });

  group('Volunteer home', () {
    testWidgets('loads nearby and assigned requests from the API',
        (tester) async {
      await tester.pumpWidget(const MaterialApp(home: VolunteerHomeScreen(pollInterval: null)));
      await tester.pumpAndSettle();

      expect(find.text('Requests in Your Area'), findsOneWidget);
      expect(find.text('Need a ride to the clinic at 4 pm'), findsOneWidget);
      expect(find.text('Requests You Accepted'), findsOneWidget);
      expect(find.text('Pick up a prescription from the chemist'), findsOneWidget);

      // Real API calls, using the volunteer's registered base coordinates.
      expect(
        api.calls,
        contains(
            'GET /api/requests/nearby?lat=13.3522&lng=74.7928&radius_m=5000'),
      );
      expect(api.calls, contains('GET /api/requests/me'));
    });

    // Signing out lives on the profile screen, so the app-bar avatar is the
    // only way a volunteer reaches it.
    testWidgets('the app bar avatar opens the profile with Log out',
        (tester) async {
      await tester.pumpWidget(
          const MaterialApp(home: VolunteerHomeScreen(pollInterval: null)));
      await tester.pumpAndSettle();

      await tester.tap(find.byType(CircleAvatar));
      await tester.pumpAndSettle();

      expect(find.byType(SeniorProfileScreen), findsOneWidget);
      expect(find.text('Log out'), findsOneWidget);
    });

    testWidgets('stat tiles are computed from real rows', (tester) async {
      await tester.pumpWidget(const MaterialApp(home: VolunteerHomeScreen(pollInterval: null)));
      await tester.pumpAndSettle();

      // 2 nearby, 1 active, 0 completed — the old build hard-coded 14.
      expect(
        find.descendant(
          of: find.widgetWithText(StatCard, 'Nearby'),
          matching: find.text('2'),
        ),
        findsOneWidget,
      );
      expect(
        find.descendant(
          of: find.widgetWithText(StatCard, 'Active'),
          matching: find.text('1'),
        ),
        findsOneWidget,
      );
      expect(
        find.descendant(
          of: find.widgetWithText(StatCard, 'Completed'),
          matching: find.text('0'),
        ),
        findsOneWidget,
      );
      expect(find.text('14'), findsNothing);
    });

    testWidgets('notification sheet shows the nearest request and no invented'
        ' caller details', (tester) async {
      await tester.pumpWidget(const MaterialApp(home: VolunteerHomeScreen(pollInterval: null)));
      await tester.pumpAndSettle();

      await tester.tap(find.byIcon(Icons.notifications_outlined));
      await tester.pumpAndSettle();

      expect(find.text('New Help Request'), findsOneWidget);
      // Present in the list row behind the sheet and in the sheet itself.
      expect(find.text('grocery_assistance'), findsNWidgets(2));
      expect(find.text('13.1610, 74.8830'), findsOneWidget);
      expect(find.text('1.2 km from your base'), findsOneWidget);
      expect(find.text('Accept Request'), findsOneWidget);
      expect(find.text('Decline'), findsOneWidget);
    });

    testWidgets('accepting posts the real accept endpoint and opens the'
        ' assignment screen with the senior contact', (tester) async {
      await tester.pumpWidget(const MaterialApp(home: VolunteerHomeScreen(pollInterval: null)));
      await tester.pumpAndSettle();

      await tester.tap(find.byIcon(Icons.notifications_outlined));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Accept Request'));
      await tester.pumpAndSettle();

      expect(requests.accepted, ['b60a80d5-893f-4160-bb27-e21358efea46']);
      expect(
        api.calls,
        contains(
            'PATCH /api/requests/b60a80d5-893f-4160-bb27-e21358efea46/accept'),
      );
      expect(find.text('Pooja Hegde'), findsOneWidget);
      expect(find.text('+91 98765 43210'), findsOneWidget);
    });

    testWidgets('declining calls the decline endpoint so the request does not'
        ' come back on the next refresh', (tester) async {
      await tester.pumpWidget(const MaterialApp(home: VolunteerHomeScreen(pollInterval: null)));
      await tester.pumpAndSettle();

      await tester.tap(find.byIcon(Icons.notifications_outlined));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Decline'));
      await tester.pumpAndSettle();

      expect(requests.declined, ['b60a80d5-893f-4160-bb27-e21358efea46']);
      expect(
        api.calls,
        contains(
            'PATCH /api/requests/b60a80d5-893f-4160-bb27-e21358efea46/decline {}'),
      );
      expect(requests.accepted, isEmpty);
      expect(
        find.text('Declined. It stays available to other volunteers.'),
        findsOneWidget,
      );
    });

    testWidgets('an off-duty volunteer is told why they receive nothing',
        (tester) async {
      api.available = false;
      await tester.pumpWidget(
        const MaterialApp(home: VolunteerHomeScreen(pollInterval: null)),
      );
      await tester.pumpAndSettle();

      // Off duty is the default after registration, and the dispatcher only
      // selects available volunteers, so "Nearby 0" needs explaining.
      expect(find.text('You are off duty'), findsOneWidget);
      expect(
        find.textContaining('will not receive any requests until you go on duty'),
        findsOneWidget,
      );
      expect(find.text('Go on duty'), findsOneWidget);

      await tester.tap(find.text('Go on duty'));
      await tester.pumpAndSettle();

      expect(requests.availabilityChanges.last, true);
      expect(find.text('You are off duty'), findsNothing);
    });

    testWidgets('polling surfaces a request dispatched while the app is open',
        (tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: VolunteerHomeScreen(pollInterval: Duration(seconds: 15)),
        ),
      );
      await tester.pumpAndSettle();

      // Not there yet.
      expect(find.text('Need a wheelchair ramp check'), findsNothing);

      // A senior raises a request and dispatch notifies this volunteer.
      api.pushedRequests.add({
        'id': '7d1e2f30-4a5b-4c6d-8e9f-0a1b2c3d4e5f',
        'category': 'medical_help',
        'description': 'Need a wheelchair ramp check',
        'latitude': 13.161,
        'longitude': 74.883,
        'priority': 'urgent',
        'created_at': '2026-09-25T12:30:00.000Z',
        'distance_m': '900.0',
      });

      // No pull-to-refresh, no button: the poll has to find it.
      await tester.pump(const Duration(seconds: 16));
      await tester.pumpAndSettle();

      expect(find.text('Need a wheelchair ramp check'), findsOneWidget);
      expect(find.text('New help request nearby'), findsOneWidget);
    });

    testWidgets('availability toggle uses the availability endpoint',
        (tester) async {
      await tester.pumpWidget(const MaterialApp(home: VolunteerHomeScreen(pollInterval: null)));
      await tester.pumpAndSettle();

      expect(find.text('Available for requests'), findsOneWidget);
      await tester.tap(find.byType(Switch));
      await tester.pumpAndSettle();

      expect(requests.availabilityChanges, [false]);
      expect(
        api.calls,
        contains(
            'PATCH /api/volunteers/me/availability {is_available: false}'),
      );
    });
  });

  group('Request detail', () {
    testWidgets('renders only server-provided fields', (tester) async {
      final request = HelpRequest.fromJson(
          (_nearbyJson['requests'] as List).first as Map<String, dynamic>);

      await tester.pumpWidget(MaterialApp(
        home: RequestDetailScreen(
          request: request,
          isAvailable: true,
          isAccepting: false,
          onAccept: () async {},
          onSkip: () {},
        ),
      ));
      await tester.pumpAndSettle();

      expect(find.text('Request Detail'), findsOneWidget);
      expect(find.text('URGENT'), findsWidgets);
      expect(find.textContaining('Voice test'), findsOneWidget);
      expect(find.text('13.1610, 74.8830'), findsOneWidget);
      expect(find.text('1.2 km from your registered base'), findsOneWidget);
      expect(find.text('Accept Request'), findsOneWidget);
      expect(find.text('Decline this request'), findsOneWidget);
    });

    testWidgets('accept is blocked while the volunteer is unavailable',
        (tester) async {
      final request = HelpRequest.fromJson(
          (_nearbyJson['requests'] as List).first as Map<String, dynamic>);

      await tester.pumpWidget(MaterialApp(
        home: RequestDetailScreen(
          request: request,
          isAvailable: false,
          isAccepting: false,
          onAccept: () async {},
          onSkip: () {},
        ),
      ));
      await tester.pumpAndSettle();

      expect(find.text('Turn on availability to accept requests.'),
          findsOneWidget);
      final button = tester.widget<ElevatedButton>(find.ancestor(
        of: find.text('Accept Request'),
        matching: find.byType(ElevatedButton),
      ));
      expect(button.onPressed, isNull);
    });
  });
}
