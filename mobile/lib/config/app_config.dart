import 'package:flutter/foundation.dart';

/// Compile-time application configuration.
///
/// `API_BASE_URL` is injected at build/run time via
/// `--dart-define=API_BASE_URL=http://<host>:3000`.
/// Without it: Android uses the emulator host loopback (10.0.2.2); every
/// other platform (web, desktop) uses localhost.
/// Use your machine's LAN IP when running on a physical Android device.
class AppConfig {
  AppConfig._();

  static const String _fromBuild = String.fromEnvironment('API_BASE_URL');

  static String get apiBaseUrl {
    if (_fromBuild.isNotEmpty) {
      return _fromBuild;
    }
    if (kIsWeb) {
      return 'http://localhost:3000';
    }
    if (defaultTargetPlatform == TargetPlatform.android) {
      return 'http://10.0.2.2:3000';
    }
    return 'http://localhost:3000';
  }

  /// The coordinates both registration forms open with.
  ///
  /// A senior and a volunteer created through the app start on the same point,
  /// so a request either one raises is always inside the backend's
  /// `MATCH_RADIUS_M` (5 km) without anyone hand-typing coordinates. These
  /// match the fixed point `backend/scripts/e2e-real-flow.ts` uses, so accounts
  /// made in the app sit in the same place as the ones the e2e flow makes.
  ///
  /// Only a starting point: the fields stay editable for anyone testing a
  /// specific spot.
  static const double defaultLatitude = 12.9716;
  static const double defaultLongitude = 77.5946;
}
