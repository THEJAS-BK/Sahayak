import 'package:shared_preferences/shared_preferences.dart';

/// Persists a minimal user profile so that returning users skip the
/// registration flow and land directly on their role dashboard.
///
/// Keys stored in SharedPreferences:
///   `session_role`         – "volunteer" | "senior"
///   `session_registered`   – true once police-verification step is passed
class UserSession {
  UserSession._();

  static const _keyRole = 'session_role';
  static const _keyRegistered = 'session_registered';

  // ── Write ────────────────────────────────────────────────────────────────

  /// Call this when the user successfully completes verification and lands
  /// on the dashboard for the first time.
  static Future<void> save({required String role}) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_keyRole, role);
    await prefs.setBool(_keyRegistered, true);
  }

  // ── Read ─────────────────────────────────────────────────────────────────

  /// Returns the saved role ("volunteer" | "senior") if the user has
  /// completed registration before, otherwise null.
  static Future<String?> getSavedRole() async {
    final prefs = await SharedPreferences.getInstance();
    final registered = prefs.getBool(_keyRegistered) ?? false;
    if (!registered) return null;
    return prefs.getString(_keyRole);
  }

  // ── Clear ────────────────────────────────────────────────────────────────

  /// Call on logout so the next app launch goes through the full flow.
  static Future<void> clear() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_keyRole);
    await prefs.remove(_keyRegistered);
  }
}
