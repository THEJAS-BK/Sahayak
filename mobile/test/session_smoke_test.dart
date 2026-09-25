// Quick smoke test for UserSession logic (runs on host, not on device)
// Run with: dart test/session_smoke_test.dart
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:sahayak_mobile/services/user_session.dart';

void main() {
  group('UserSession', () {
    setUp(() {
      // Use a fresh in-memory SharedPreferences for each test
      SharedPreferences.setMockInitialValues({});
    });

    test('getSavedRole returns null when nothing is stored', () async {
      final role = await UserSession.getSavedRole();
      expect(role, isNull);
    });

    test('save(volunteer) → getSavedRole returns "volunteer"', () async {
      await UserSession.save(role: 'volunteer');
      final role = await UserSession.getSavedRole();
      expect(role, equals('volunteer'));
    });

    test('save(senior) → getSavedRole returns "senior"', () async {
      await UserSession.save(role: 'senior');
      final role = await UserSession.getSavedRole();
      expect(role, equals('senior'));
    });

    test('clear() → getSavedRole returns null', () async {
      await UserSession.save(role: 'volunteer');
      await UserSession.clear();
      final role = await UserSession.getSavedRole();
      expect(role, isNull);
    });

    test('getSavedRole returns null if registered=false even with role stored',
        () async {
      // Simulate partial/corrupt state — role stored but not marked registered
      SharedPreferences.setMockInitialValues({
        'session_role': 'volunteer',
        // 'session_registered' is missing — treated as false
      });
      final role = await UserSession.getSavedRole();
      expect(role, isNull);
    });
  });
}
