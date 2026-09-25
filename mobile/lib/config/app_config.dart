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
}
