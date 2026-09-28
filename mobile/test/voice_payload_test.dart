import 'package:flutter_test/flutter_test.dart';
import 'package:sahayak_mobile/services/voice_payload.dart';

void main() {
  group('VoiceHelpRequest.fromDataChannel', () {
    test('parses the v1 envelope', () {
      final r = VoiceHelpRequest.fromDataChannel({
        'v': 1,
        'type': 'help_request',
        'request_id': 'abc-123',
        'request': {
          'category': 'grocery_assistance',
          'description': 'Need rice and oil',
          'priority': 'urgent',
          'details': {'items': ['rice', 'oil']},
        },
      });

      expect(r.requestId, 'abc-123');
      expect(r.category, 'grocery_assistance');
      expect(r.description, 'Need rice and oil');
      expect(r.priority, 'urgent');
      expect(r.details, {'items': ['rice', 'oil']});
      expect(r.isValid, isTrue);
    });

    test('still accepts the legacy bare payload', () {
      final r = VoiceHelpRequest.fromDataChannel({
        'category': 'medical_assistance',
        'description': 'Need a doctor for fever',
        'priority': 'urgent',
        'details': {'symptom': 'fever'},
      });

      expect(r.requestId, isEmpty);
      expect(r.category, 'medical_assistance');
      expect(r.priority, 'urgent');
      expect(r.isValid, isTrue);
    });

    test('defaults priority to normal and tolerates unknown values', () {
      final r = VoiceHelpRequest.fromDataChannel({
        'category': 'transport_assistance',
        'description': 'Need a ride',
        'priority': 'asap',
      });

      expect(r.priority, 'normal');
    });

    test('rejects non-object payload', () {
      expect(() => VoiceHelpRequest.fromDataChannel('nope'),
          throwsA(isA<VoicePayloadException>()));
    });

    test('rejects a mismatched envelope version', () {
      expect(
        () => VoiceHelpRequest.fromDataChannel({
          'v': 99,
          'request': {'category': 'other', 'description': 'x'},
        }),
        throwsA(isA<VoicePayloadException>()),
      );
    });

    test('isValid is false for missing/invalid category', () {
      expect(
        VoiceHelpRequest.fromDataChannel({'description': 'x'}).isValid,
        isFalse,
      );
      expect(
        VoiceHelpRequest.fromDataChannel({
          'category': 'Bad category!',
          'description': 'x',
        }).isValid,
        isFalse,
      );
    });
  });

  group('VoiceHelpRequest.copyWith', () {
    test('replaces only the given fields and keeps requestId/details', () {
      final r = VoiceHelpRequest.fromDataChannel({
        'v': 1,
        'request_id': 'abc-123',
        'request': {
          'category': 'grocery_assistance',
          'description': 'Need rice and oil',
          'priority': 'normal',
          'details': {'items': ['rice']},
        },
      });

      final edited = r.copyWith(
        category: 'medical_assistance',
        description: 'Need a doctor',
        priority: 'urgent',
      );

      expect(edited.requestId, 'abc-123');
      expect(edited.category, 'medical_assistance');
      expect(edited.description, 'Need a doctor');
      expect(edited.priority, 'urgent');
      expect(edited.details, {'items': ['rice']});
      // Original untouched.
      expect(r.category, 'grocery_assistance');
      expect(r.priority, 'normal');
    });

    test('normalises an unknown priority to normal', () {
      final r = VoiceHelpRequest.fromDataChannel({
        'category': 'other',
        'description': 'x',
        'priority': 'urgent',
      });

      expect(r.copyWith(priority: 'asap').priority, 'normal');
    });
  });

  group('VoiceHelpRequest.toCreateBody', () {
    test('produces the Q-01 body with voice_agent source at the given coords',
        () {
      final r = VoiceHelpRequest.fromDataChannel({
        'v': 1,
        'request_id': 'abc',
        'request': {
          'category': 'grocery_assistance',
          'description': 'Need rice and oil',
          'priority': 'normal',
          'details': {'items': ['rice', 'oil']},
        },
      });

      expect(
          r.toCreateBody(latitude: 13.161, longitude: 74.883), {
        'category': 'grocery_assistance',
        'description': 'Need rice and oil',
        'details': {'items': ['rice', 'oil']},
        'latitude': 13.161,
        'longitude': 74.883,
        'priority': 'normal',
        'source': 'voice_agent',
      });
    });

    test('omits details when absent', () {
      final r = VoiceHelpRequest.fromDataChannel({
        'category': 'other',
        'description': 'Just checking',
      });

      final body = r.toCreateBody(latitude: 13.161, longitude: 74.883);
      expect(body.containsKey('details'), isFalse);
    });
  });
}