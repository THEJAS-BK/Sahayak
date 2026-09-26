import 'api_client.dart';

/// The signed-in user's real profile, as returned by `GET /api/me`.
///
/// A senior profile carries the registered home coordinates
/// (`homeLatitude`/`homeLongitude`); a volunteer profile carries the base
/// coordinates (`baseLatitude`/`baseLongitude`) used to search for nearby
/// requests.  Both come from the registration the user actually submitted.
class MyProfile {
  final String id;
  final String email;
  final String? role;
  final bool isActive;
  final String verificationStatus;
  final String? fullName;
  final String? phoneNumber;
  final String? organization;
  final List<String> skills;
  final double? homeLatitude;
  final double? homeLongitude;
  final double? baseLatitude;
  final double? baseLongitude;
  final bool isAvailable;

  const MyProfile({
    required this.id,
    required this.email,
    this.role,
    this.isActive = true,
    this.verificationStatus = 'NONE',
    this.fullName,
    this.phoneNumber,
    this.organization,
    this.skills = const [],
    this.homeLatitude,
    this.homeLongitude,
    this.baseLatitude,
    this.baseLongitude,
    this.isAvailable = false,
  });

  factory MyProfile.fromJson(Map<String, dynamic> json) {
    final profile =
        json['profile'] is Map<String, dynamic> ? json['profile'] as Map<String, dynamic> : const <String, dynamic>{};
    final rawSkills = profile['skills'];
    return MyProfile(
      id: (json['id'] ?? '').toString(),
      email: (json['email'] ?? '').toString(),
      role: json['role']?.toString(),
      isActive: (json['is_active'] as bool?) ?? true,
      verificationStatus: (json['verification_status'] ?? 'NONE').toString(),
      fullName: profile['full_name']?.toString(),
      phoneNumber: profile['phone_number']?.toString(),
      organization: profile['organization']?.toString(),
      skills: rawSkills is List ? rawSkills.map((e) => e.toString()).toList() : const [],
      homeLatitude: _double(profile['homeLatitude']),
      homeLongitude: _double(profile['homeLongitude']),
      baseLatitude: _double(profile['baseLatitude']),
      baseLongitude: _double(profile['baseLongitude']),
      isAvailable: (profile['isAvailable'] as bool?) ?? false,
    );
  }

  static double? _double(Object? raw) {
    if (raw == null) return null;
    if (raw is num) return raw.toDouble();
    return double.tryParse(raw.toString());
  }

  /// Coordinates a senior's request should be filed at.
  ({double latitude, double longitude})? get homeCoordinates {
    if (homeLatitude == null || homeLongitude == null) return null;
    return (latitude: homeLatitude!, longitude: homeLongitude!);
  }

  /// Coordinates a volunteer should search around.
  ({double latitude, double longitude})? get baseCoordinates {
    if (baseLatitude == null || baseLongitude == null) return null;
    return (latitude: baseLatitude!, longitude: baseLongitude!);
  }
}

/// Reads the signed-in user's real profile.  Cached for the app session.
class ProfileService {
  /// Public for test doubles; the app uses [instance].
  ProfileService();

  static ProfileService get instance => _override ?? _default;
  static final ProfileService _default = ProfileService();
  static ProfileService? _override;

  /// Test seam — point the app at a fake profile source.
  // ignore: use_setters_to_change_properties
  static set overrideForTest(ProfileService? service) => _override = service;

  MyProfile? _cached;

  MyProfile? get cached => _cached;

  Future<MyProfile> fetchMe({bool force = false}) async {
    if (!force && _cached != null) return _cached!;
    final data = await ApiClient.instance.get('/api/me');
    final profile = MyProfile.fromJson(data);
    _cached = profile;
    return profile;
  }

  void clearCache() => _cached = null;
}
