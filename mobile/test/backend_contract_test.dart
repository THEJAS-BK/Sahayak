import 'package:flutter_test/flutter_test.dart';
import 'package:sahayak_mobile/services/profile_service.dart';
import 'package:sahayak_mobile/services/registration_service.dart';

/// A `/api/me` body with the shape the backend actually sends: a snake_case
/// envelope around a camelCased profile object (users.routes.ts against
/// users.service.ts `shape`, which camelCases every profile column).
Map<String, dynamic> meResponse({Map<String, dynamic>? profile}) => {
      'id': 'u1',
      'email': 'anita@example.com',
      'role': 'senior',
      'is_active': true,
      'verification_status': 'APPROVED',
      'profile': profile ??
          {
            'id': 'p1',
            'userId': 'u1',
            'fullName': 'Anita Desai',
            'phoneNumber': '+91 98111 22334',
            'homeLatitude': 12.971599,
            'homeLongitude': 77.209566,
            'preferredLanguage': 'kannada',
          },
    };

void main() {
  group('MyProfile.fromJson', () {
    test('reads the camelCased profile the backend sends', () {
      final p = MyProfile.fromJson(meResponse());

      expect(p.fullName, 'Anita Desai');
      expect(p.phoneNumber, '+91 98111 22334');
      expect(p.homeLatitude, 12.971599);
      expect(p.homeLongitude, 77.209566);
    });

    test('reads the snake_case envelope', () {
      final p = MyProfile.fromJson(meResponse());

      expect(p.id, 'u1');
      expect(p.role, 'senior');
      expect(p.isActive, isTrue);
      expect(p.verificationStatus, 'APPROVED');
    });

    test('a volunteer profile is available and knows its own skills', () {
      final p = MyProfile.fromJson(meResponse(profile: {
        'fullName': 'Ravi Kumar',
        'phoneNumber': '9876543210',
        'organization': 'Mahila Samiti',
        'skills': ['medical', 'transport'],
        'baseLatitude': 12.97,
        'baseLongitude': 77.21,
        'isAvailable': true,
      }));

      expect(p.organization, 'Mahila Samiti');
      expect(p.skills, ['medical', 'transport']);
      expect(p.isAvailable, isTrue);
      expect(p.baseLatitude, 12.97);
    });

    test('a pending account has no role and is not active', () {
      final p = MyProfile.fromJson({
        'id': 'u2',
        'email': 'new@example.com',
        'role': null,
        'is_active': false,
        'verification_status': 'PENDING',
        'profile': null,
      });

      expect(p.role, isNull);
      expect(p.isActive, isFalse);
      expect(p.verificationStatus, 'PENDING');
      expect(p.fullName, isNull);
    });

    test('a missing profile object does not throw', () {
      final p = MyProfile.fromJson({'id': 'u3', 'email': 'x@example.com'});

      expect(p.fullName, isNull);
      expect(p.phoneNumber, isNull);
      expect(p.skills, isEmpty);
      expect(p.isAvailable, isFalse);
    });
  });

  group('RegistrationValidation', () {
    String? problem({
      String name = 'Anita Desai',
      String phone = '9876543210',
      String aadhaar = '123456789012',
      double? lat = 12.97,
      double? lng = 77.21,
    }) =>
        RegistrationValidation.problem(
          fullName: name,
          phoneNumber: phone,
          aadhaar: aadhaar,
          latitude: lat,
          longitude: lng,
          latitudeLabel: 'home',
        );

    test('accepts a well-formed registration', () {
      expect(problem(), isNull);
    });

    // The backend's aadhaarSchema is 12 digits. A length check alone let
    // '1234-5678-12' through to a server-side rejection.
    test('rejects a 12-character Aadhaar that is not 12 digits', () {
      expect(problem(aadhaar: '1234-5678-12'), isNotNull);
      expect(problem(aadhaar: 'abcdefghijkl'), isNotNull);
      expect(problem(aadhaar: '12345678901'), isNotNull);
      expect(problem(aadhaar: '1234567890123'), isNotNull);
      expect(problem(aadhaar: ''), isNotNull);
    });

    test('accepts spaces in the Aadhaar only because they are stripped first', () {
      // The screens strip whitespace before validating.
      expect(problem(aadhaar: '1234 5678 9012'.replaceAll(RegExp(r'\s'), '')), isNull);
    });

    // The backend's phoneSchema is 5-20 chars of digits, spaces, + and -.
    test('rejects phone numbers the backend would reject', () {
      expect(problem(phone: ''), isNotNull);
      expect(problem(phone: '1234'), isNotNull);
      expect(problem(phone: '123456789012345678901'), isNotNull);
      expect(problem(phone: '98765abcde'), isNotNull);
    });

    test('accepts the phone formats the backend allows', () {
      expect(problem(phone: '98765'), isNull);
      expect(problem(phone: '+91 98765 43210'), isNull);
      expect(problem(phone: '98765-43210'), isNull);
    });

    test('rejects an empty or over-long name', () {
      expect(problem(name: ''), isNotNull);
      expect(problem(name: '   '), isNotNull);
      expect(problem(name: 'a' * 201), isNotNull);
      expect(problem(name: 'a' * 200), isNull);
    });

    test('rejects missing and out-of-range coordinates', () {
      expect(problem(lat: null), isNotNull);
      expect(problem(lng: null), isNotNull);
      expect(problem(lat: 91), isNotNull);
      expect(problem(lat: -91), isNotNull);
      expect(problem(lng: 181), isNotNull);
      expect(problem(lng: -181), isNotNull);
      expect(problem(lat: 90, lng: 180), isNull);
      expect(problem(lat: -90, lng: -180), isNull);
    });

    test('the coordinate message says which location is wrong', () {
      final base = RegistrationValidation.problem(
        fullName: 'Anita Desai',
        phoneNumber: '9876543210',
        aadhaar: '123456789012',
        latitude: null,
        longitude: 77.21,
        latitudeLabel: 'base',
      );
      expect(base, contains('base'));

      final home = RegistrationValidation.problem(
        fullName: 'Anita Desai',
        phoneNumber: '9876543210',
        aadhaar: '123456789012',
        latitude: null,
        longitude: 77.21,
        latitudeLabel: 'home',
      );
      expect(home, contains('home'));
    });
  });
}
