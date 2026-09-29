import 'api_client.dart';

/// The help-request categories the voice agent and matching service use.
/// A volunteer's `skills` must be a subset of these, otherwise the request is
/// dispatched to them only on distance, never on skill match.
const helpCategories = <String, String>{
  'grocery_assistance': 'Groceries',
  'medical_assistance': 'Medical',
  'transport_assistance': 'Transport',
  'other': 'Other help',
};

/// Client-side mirrors of the backend's registration schemas
/// (`registrations.routes.ts`), so a value the server will reject is caught
/// before the round trip instead of coming back as a generic 400 that does not
/// say which field was wrong.
class RegistrationValidation {
  const RegistrationValidation._();

  /// `phoneSchema`: 5-20 chars, digits/spaces/+/- only.
  static final RegExp _phone = RegExp(r'^[0-9+\s-]+$');

  /// `aadhaarSchema`: exactly 12 digits. A length check alone would let
  /// `1234-5678-12` or twelve letters through to a server-side rejection.
  static final RegExp _aadhaar = RegExp(r'^\d{12}$');

  static const int nameMaxLength = 200;
  static const int phoneMinLength = 5;
  static const int phoneMaxLength = 20;

  static bool isValidName(String value) =>
      value.trim().isNotEmpty && value.length <= nameMaxLength;

  static bool isValidPhone(String value) =>
      value.length >= phoneMinLength &&
      value.length <= phoneMaxLength &&
      _phone.hasMatch(value);

  static bool isValidAadhaar(String value) => _aadhaar.hasMatch(value);

  /// The first problem with a registration form, phrased for the user, or null
  /// when the form is acceptable. [aadhaar] is expected pre-stripped of spaces.
  static String? problem({
    required String fullName,
    required String phoneNumber,
    required String aadhaar,
    required double? latitude,
    required double? longitude,
    required String latitudeLabel,
  }) {
    if (!isValidName(fullName)) {
      return fullName.trim().isEmpty
          ? 'Enter your full name'
          : 'That name is too long (max $nameMaxLength characters)';
    }
    if (!isValidPhone(phoneNumber)) {
      return 'Enter a valid phone number ($phoneMinLength-$phoneMaxLength digits, '
          'spaces, + and - only)';
    }
    if (!isValidAadhaar(aadhaar)) {
      return 'Enter your 12-digit Aadhaar number';
    }
    if (latitude == null || longitude == null) {
      return 'Enter $latitudeLabel latitude and longitude';
    }
    if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
      return 'Enter a valid $latitudeLabel latitude and longitude';
    }
    return null;
  }
}

/// Registration endpoints (all require an authenticated account with no role
/// yet — the backend rejects a second registration).
///   R-01 POST /api/registrations/senior
///   R-02 POST /api/registrations/volunteer
///   R-03 GET  /api/registrations/me
class RegistrationService {
  /// Public for test doubles; the app uses [instance].
  RegistrationService();

  static RegistrationService get instance => _override ?? _default;
  static final RegistrationService _default = RegistrationService();
  static RegistrationService? _override;

  /// Test seam — point the app at a fake registration backend.
  // ignore: use_setters_to_change_properties
  static set overrideForTest(RegistrationService? service) => _override = service;

  Future<String> submitSenior({
    required String fullName,
    required String phoneNumber,
    required String aadhaarNumber,
    required double latitude,
    required double longitude,
    required String language,
  }) async {
    final data = await ApiClient.instance.post('/api/registrations/senior', body: {
      'full_name': fullName,
      'phone_number': phoneNumber,
      'aadhaar_number': aadhaarNumber,
      'home_latitude': latitude,
      'home_longitude': longitude,
      'preferred_language': language,
    });
    return (data['verification_id'] ?? '').toString();
  }

  Future<String> submitVolunteer({
    required String fullName,
    required String phoneNumber,
    required String aadhaarNumber,
    required List<String> skills,
    required double latitude,
    required double longitude,
    String? organization,
    String? clubId,
  }) async {
    final data = await ApiClient.instance.post('/api/registrations/volunteer', body: {
      'full_name': fullName,
      'phone_number': phoneNumber,
      'aadhaar_number': aadhaarNumber,
      'skills': skills,
      'base_latitude': latitude,
      'base_longitude': longitude,
      if (organization != null && organization.isNotEmpty) 'organization': organization,
      if (clubId != null && clubId.isNotEmpty) 'club_id': clubId,
    });
    return (data['verification_id'] ?? '').toString();
  }

  /// R-03 — the caller's own verification, used for status polling.
  Future<MyVerification?> myVerification() async {
    final data = await ApiClient.instance.get('/api/registrations/me');
    final raw = data['verification'];
    if (raw is! Map<String, dynamic>) return null;
    return MyVerification.fromJson(raw);
  }
}

class MyVerification {
  final String id;
  final String role;
  final String status;
  final String? reviewReason;
  final DateTime? reviewedAt;

  const MyVerification({
    required this.id,
    required this.role,
    required this.status,
    this.reviewReason,
    this.reviewedAt,
  });

  factory MyVerification.fromJson(Map<String, dynamic> json) {
    final reviewed = json['reviewed_at'];
    return MyVerification(
      id: (json['verification_id'] ?? '').toString(),
      role: (json['role'] ?? '').toString(),
      status: (json['status'] ?? 'PENDING').toString(),
      reviewReason: json['review_reason']?.toString(),
      reviewedAt: reviewed == null
          ? null
          : DateTime.tryParse(reviewed.toString())?.toLocal(),
    );
  }

  bool get isPending => status == 'PENDING';
  bool get isApproved => status == 'APPROVED';
  bool get isRejected => status == 'REJECTED';
}
