import 'dart:convert';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Signed-in session persisted in platform secure storage
/// (Android Keystore / iOS Keychain).
class Session {
  const Session({
    required this.accessToken,
    this.refreshToken,
    required this.userId,
    required this.role,
    this.isActive = true,
  });

  final String accessToken;
  final String? refreshToken;
  final String userId;
  final String role;
  final bool isActive;

  Map<String, dynamic> toJson() => {
        'userId': userId,
        'role': role,
        'isActive': isActive,
      };

  factory Session.fromJson(Map<String, dynamic> json,
          {required String accessToken, String? refreshToken}) =>
      Session(
        accessToken: accessToken,
        refreshToken: refreshToken,
        userId: (json['userId'] ?? '').toString(),
        role: (json['role'] ?? '').toString(),
        isActive: (json['isActive'] as bool?) ?? true,
      );
}

/// Loads/saves/clears the current session. Simple singleton — the app does
/// not use a state-management framework yet.
class SessionService {
  SessionService._();

  static final SessionService instance = SessionService._();

  static const _kAccessToken = 'auth_access_token';
  static const _kRefreshToken = 'auth_refresh_token';
  static const _kUser = 'auth_user';

  final FlutterSecureStorage _storage = const FlutterSecureStorage();

  Session? _session;
  Session? get session => _session;
  String? get accessToken => _session?.accessToken;
  String? get refreshToken => _session?.refreshToken;

  /// Persists a newly-issued session and caches it in memory.
  Future<void> save(Session session) async {
    _session = session;
    await _storage.write(key: _kAccessToken, value: session.accessToken);
    if (session.refreshToken != null && session.refreshToken!.isNotEmpty) {
      await _storage.write(key: _kRefreshToken, value: session.refreshToken);
    }
    await _storage.write(key: _kUser, value: jsonEncode(session.toJson()));
  }

  /// Restores any persisted session into memory. Returns the session or null.
  Future<Session?> restore() async {
    final access = await _storage.read(key: _kAccessToken);
    if (access == null || access.isEmpty) {
      _session = null;
      return null;
    }
    final refresh = await _storage.read(key: _kRefreshToken);
    final rawUser = await _storage.read(key: _kUser);
    Session? parsed;
    if (rawUser != null && rawUser.isNotEmpty) {
      try {
        parsed = Session.fromJson(
          jsonDecode(rawUser) as Map<String, dynamic>,
          accessToken: access,
          refreshToken: refresh,
        );
      } catch (_) {
        parsed = null;
      }
    }
    _session = parsed ??
        Session(
            accessToken: access, refreshToken: refresh, userId: '', role: '');
    return _session;
  }

  /// Rotates the tokens after a refresh while keeping the cached user info.
  Future<void> updateTokens(String accessToken, String? refreshToken) async {
    final current = _session;
    final updated = Session(
      accessToken: accessToken,
      refreshToken: refreshToken ?? current?.refreshToken,
      userId: current?.userId ?? '',
      role: current?.role ?? '',
      isActive: current?.isActive ?? true,
    );
    await save(updated);
  }

  Future<void> clear() async {
    _session = null;
    await _storage.deleteAll();
  }
}
