import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:sahayak_mobile/models/help_request.dart';
import 'package:sahayak_mobile/screens/registration_submitted_screen.dart';
import 'package:sahayak_mobile/screens/volunteer_home_screen.dart';
import 'package:sahayak_mobile/services/api_client.dart';
import 'package:sahayak_mobile/services/profile_service.dart';
import 'package:sahayak_mobile/services/registration_service.dart';
import 'package:sahayak_mobile/services/requests_service.dart';
import 'package:sahayak_mobile/services/user_session.dart';

/// Regression coverage for the post-approval session bug: the access token
/// issued at login still carries the pre-approval claims (role null, account
/// inactive), so the screen must rotate it before it navigates — otherwise
/// every active-role endpoint answers 403 FORBIDDEN.
class _FakeApiClient extends ApiClient {
  _FakeApiClient({required this.refreshSucceeds});

  final bool refreshSucceeds;
  int refreshCalls = 0;

  @override
  Future<bool> refresh() async {
    refreshCalls++;
    return refreshSucceeds;
  }
}

class _FakeRegistrationService extends RegistrationService {
  _FakeRegistrationService(this.statuses);

  /// Consumed one per poll, so the test can start PENDING then flip to APPROVED.
  final List<String> statuses;
  int polls = 0;

  @override
  Future<MyVerification?> myVerification() async {
    final status = statuses[polls.clamp(0, statuses.length - 1)];
    polls++;
    return MyVerification(id: 'v-1', role: 'volunteer', status: status);
  }
}

class _EmptyProfileService extends ProfileService {
  @override
  Future<MyProfile> fetchMe({bool force = false}) async => const MyProfile(
        id: 'v-1',
        email: 'karthik.shetty@example.com',
        role: 'volunteer',
        fullName: 'Karthik Shetty',
        phoneNumber: '+91 90000 11111',
        baseLatitude: 13.3522,
        baseLongitude: 74.7928,
      );
}

class _EmptyRequestsService extends RequestsService {
  @override
  Future<List<HelpRequest>> nearby({
    required double latitude,
    required double longitude,
    int radiusMeters = 5000,
  }) async =>
      [];

  @override
  Future<List<HelpRequest>> mine() async => [];

  @override
  Future<void> setAvailability(bool available) async {}
}

void main() {
  tearDown(() {
    ApiClient.overrideForTest = null;
    RegistrationService.overrideForTest = null;
    ProfileService.overrideForTest = null;
    RequestsService.overrideForTest = null;
  });

  testWidgets('APPROVED refreshes the stale session before entering the app',
      (tester) async {
    SharedPreferences.setMockInitialValues({});
    final api = _FakeApiClient(refreshSucceeds: true);
    final registration = _FakeRegistrationService(['PENDING', 'APPROVED']);
    ApiClient.overrideForTest = api;
    RegistrationService.overrideForTest = registration;
    ProfileService.overrideForTest = _EmptyProfileService();
    RequestsService.overrideForTest = _EmptyRequestsService();

    await tester.pumpWidget(const MaterialApp(
      home: RegistrationSubmittedScreen(role: UserRole.volunteer),
    ));
    expect(find.text('Volunteer Portal'), findsNothing);

    // initState polls immediately and reports PENDING.
    expect(registration.polls, 1);
    expect(api.refreshCalls, 0, reason: 'no refresh while still pending');

    // The 3s poll picks up the approval.
    await tester.pump(const Duration(seconds: 3));
    // No pumpAndSettle here: VolunteerHomeScreen pulses forever.
    await tester.pump(const Duration(seconds: 1));

    expect(api.refreshCalls, 1, reason: 'session rotated exactly once');
    expect(await UserSession.getSavedRole(), 'volunteer');
    expect(find.byType(VolunteerHomeScreen), findsOneWidget);

    await tester.pumpWidget(const SizedBox());
  });

  testWidgets('a failed refresh sends the user back to sign in', (tester) async {
    SharedPreferences.setMockInitialValues({});
    final api = _FakeApiClient(refreshSucceeds: false);
    ApiClient.overrideForTest = api;
    RegistrationService.overrideForTest =
        _FakeRegistrationService(['APPROVED']);
    ProfileService.overrideForTest = _EmptyProfileService();
    RequestsService.overrideForTest = _EmptyRequestsService();

    await tester.pumpWidget(const MaterialApp(
      home: RegistrationSubmittedScreen(role: UserRole.volunteer),
    ));
    await tester.pump(const Duration(seconds: 3));
    await tester.pump(const Duration(seconds: 1));

    expect(api.refreshCalls, 1);
    expect(find.byType(VolunteerHomeScreen), findsNothing);
    expect(find.text('Session expired. Please sign in again.'), findsOneWidget);
    expect(await UserSession.getSavedRole(), isNull);

    await tester.pumpWidget(const SizedBox());
  });
}
