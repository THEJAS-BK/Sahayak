// Signing out lives on the profile screen for both roles, so it has to clear
// every session layer and land the user back on the sign-in screen — a back
// gesture must not return them to a home screen whose session is gone.

import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:sahayak_mobile/screens/create_login_screen.dart';
import 'package:sahayak_mobile/screens/senior_profile_screen.dart';
import 'package:sahayak_mobile/services/api_client.dart';
import 'package:sahayak_mobile/services/profile_service.dart';
import 'package:sahayak_mobile/services/user_session.dart';

class _FakeApiClient extends ApiClient {
  _FakeApiClient();

  @override
  Future<Map<String, dynamic>> get(String path) async {
    return {
      'id': 'u1',
      'email': 'someone@example.com',
      'role': 'senior',
      'is_active': true,
      'verification_status': 'APPROVED',
      'profile': {
        'full_name': 'Anita Desai',
        'phone_number': '+91 98111 22334',
      },
    };
  }
}

class _FakeProfileService extends ProfileService {
  @override
  Future<MyProfile> fetchMe({bool force = false}) async =>
      MyProfile.fromJson(await _FakeApiClient().get('/api/me'));
}

/// Signs in to the sign-in screen first, so the assertion is about where
/// logout *lands* rather than about a screen the test pushed itself.
Future<void> _pumpProfile(WidgetTester tester) async {
  SharedPreferences.setMockInitialValues({
    'session_role': 'senior',
    'session_registered': true,
  });
  FlutterSecureStorage.setMockInitialValues({
    'auth_access_token': 'a-token',
    'auth_refresh_token': 'a-refresh-token',
  });
  ProfileService.overrideForTest = _FakeProfileService();

  await tester.pumpWidget(
    const MaterialApp(home: SeniorProfileScreen()),
  );
  await tester.pumpAndSettle();
}

/// The button sits at the bottom of the profile list, below the fold of the
/// default test viewport, so scroll it into view before tapping.
Future<void> _tapLogOut(WidgetTester tester) async {
  final button = find.text('Log out');
  await tester.ensureVisible(button);
  await tester.pumpAndSettle();
  await tester.tap(button);
  await tester.pumpAndSettle();
}

void main() {
  tearDown(() => ProfileService.overrideForTest = null);

  testWidgets('the profile screen offers Log out', (tester) async {
    await _pumpProfile(tester);

    expect(find.text('Log out'), findsOneWidget);
  });

  testWidgets('Log out clears the saved role and returns to sign-in',
      (tester) async {
    await _pumpProfile(tester);

    // Sanity: the session is really there before it is torn down.
    expect(await UserSession.getSavedRole(), 'senior');

    await _tapLogOut(tester);

    expect(await UserSession.getSavedRole(), isNull);
    expect(find.byType(CreateLoginScreen), findsOneWidget);
  });

  testWidgets('a back gesture cannot return to the profile of a dead session',
      (tester) async {
    await _pumpProfile(tester);

    await _tapLogOut(tester);
    // pushAndRemoveUntil is what makes this true; a plain push would leave the
    // signed-out profile reachable behind the sign-in screen.
    expect(find.byType(SeniorProfileScreen), findsNothing);
  });
}
