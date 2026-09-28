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
