import 'dart:convert';

import 'package:http/http.dart' as http;

import '../config/app_config.dart';
import 'session_service.dart';

/// Error raised for a non-2xx backend response (or a failed request).
class ApiException implements Exception {
  const ApiException(
      {this.statusCode, required this.code, required this.message});

  final int? statusCode;
  final String code;
  final String message;

  @override
  String toString() => message;
}

/// Minimal authenticated HTTP client for the Sahayak backend.
///
/// - Attaches `Authorization: Bearer <access_token>` when a session exists.
/// - Unwraps the `{ success, data, error }` envelope.
/// - Retries once after refreshing the access token on a 401.
class ApiClient {
  /// Public for test doubles; the app uses [instance].
  ApiClient();

  static final ApiClient _defaultInstance = ApiClient();
  static ApiClient? _override;

  static ApiClient get instance => _override ?? _defaultInstance;

  /// Test seam — point the app at a fake transport.
  // ignore: use_setters_to_change_properties
  static set overrideForTest(ApiClient? client) => _override = client;

  final http.Client _http = http.Client();

  Uri _uri(String path) => Uri.parse('${AppConfig.apiBaseUrl}$path');

  /// Upper bound for any backend request; without it a dead/unreachable host
  /// leaves the UI stuck on "Sending code..."/loading screens forever.
  static const Duration _timeout = Duration(seconds: 10);

  Future<Map<String, dynamic>> post(String path,
      {Map<String, dynamic>? body}) async {
    final requestBody = jsonEncode(body ?? <String, dynamic>{});
    final token = SessionService.instance.accessToken;

    var response = await _http
        .post(
          _uri(path),
          headers: {
            'Content-Type': 'application/json',
            if (token != null) 'Authorization': 'Bearer $token'
          },
          body: requestBody,
        )
        .timeout(_timeout);

    if (response.statusCode == 401 && token != null && token.isNotEmpty) {
      final refreshed = await refresh();
      if (refreshed) {
        final newToken = SessionService.instance.accessToken;
        response = await _http
            .post(
              _uri(path),
              headers: {
                'Content-Type': 'application/json',
                if (newToken != null) 'Authorization': 'Bearer $newToken'
              },
              body: requestBody,
            )
            .timeout(_timeout);
      }
    }

    return _decode(response);
  }

  Future<Map<String, dynamic>> patch(String path,
      {Map<String, dynamic>? body}) async {
    final requestBody = jsonEncode(body ?? <String, dynamic>{});
    final token = SessionService.instance.accessToken;

    var response = await _http
        .patch(
          _uri(path),
          headers: {
            'Content-Type': 'application/json',
            if (token != null) 'Authorization': 'Bearer $token'
          },
          body: requestBody,
        )
        .timeout(_timeout);

    if (response.statusCode == 401 && token != null && token.isNotEmpty) {
      final refreshed = await refresh();
      if (refreshed) {
        final newToken = SessionService.instance.accessToken;
        response = await _http
            .patch(
              _uri(path),
              headers: {
                'Content-Type': 'application/json',
                if (newToken != null) 'Authorization': 'Bearer $newToken'
              },
              body: requestBody,
            )
            .timeout(_timeout);
      }
    }

    return _decode(response);
  }

  Future<Map<String, dynamic>> get(String path) async {
    final token = SessionService.instance.accessToken;

    var response = await _http.get(
      _uri(path),
      headers: {if (token != null) 'Authorization': 'Bearer $token'},
    ).timeout(_timeout);

    if (response.statusCode == 401 && token != null && token.isNotEmpty) {
      final refreshed = await refresh();
      if (refreshed) {
        final newToken = SessionService.instance.accessToken;
        response = await _http.get(
          _uri(path),
          headers: {if (newToken != null) 'Authorization': 'Bearer $newToken'},
        ).timeout(_timeout);
      }
    }

    return _decode(response);
  }

  /// Rotates the access token using the stored refresh token.
  /// Clears the session if the refresh token is invalid/expired.
  Future<bool> refresh() async {
    final refreshToken = SessionService.instance.refreshToken;
    if (refreshToken == null || refreshToken.isEmpty) return false;
    try {
      final res = await _http
          .post(
            _uri('/api/auth/refresh'),
            headers: {'Content-Type': 'application/json'},
            body: jsonEncode({'refresh_token': refreshToken}),
          )
          .timeout(_timeout);
      if (res.statusCode == 200) {
        final data = _decode(res);
        final user = data['user'] is Map<String, dynamic>
            ? data['user'] as Map<String, dynamic>
            : const <String, dynamic>{};
        final accessToken = data['access_token']?.toString() ?? '';
        // The refresh response carries `user: { id, role }` but no
        // `is_active`, so a mid-session approval would otherwise never be
        // picked up. The freshly issued access token does carry `is_active`
        // (and `role`) as claims, so read them from there.
        final claims = jwtClaims(accessToken);
        await SessionService.instance.updateTokens(
          accessToken,
          data['refresh_token']?.toString(),
          role: user['role']?.toString(),
          isActive: _boolClaim(claims, 'is_active'),
        );
        return true;
      }
    } catch (_) {
      // fall through to clearing the session below
    }
    await SessionService.instance.clear();
    return false;
  }

  /// Claims from a JWT payload, without verifying the signature.
  ///
  /// Only ever a local hint for keeping the cached session in step with the
  /// server; the backend stays the authority on whether a token is valid. Used
  /// because `/api/auth/refresh` omits `is_active` from its response while the
  /// token it returns carries the claim.
  static Map<String, dynamic>? jwtClaims(String token) {
    final parts = token.split('.');
    if (parts.length != 3) return null;
    try {
      final payload = parts[1].padRight((parts[1].length + 3) & ~3, '=');
      final claims = jsonDecode(utf8.decode(base64Url.decode(payload)));
      return claims is Map<String, dynamic> ? claims : null;
    } catch (_) {
      return null;
    }
  }

  /// A boolean JWT claim, or null when it is absent or not a boolean.
  ///
  /// Deliberately not a cast: a claim of an unexpected type must leave the
  /// cached value alone, and a throwing cast here would be caught by [refresh]
  /// and treated as a failed refresh, which clears a session that the server
  /// had just renewed.
  static bool? _boolClaim(Map<String, dynamic>? claims, String name) {
    final value = claims?[name];
    return value is bool ? value : null;
  }

  Map<String, dynamic> _decode(http.Response response) {
    dynamic body;
    try {
      body = jsonDecode(response.body);
    } catch (_) {
      body = null;
    }

    if (response.statusCode >= 200 && response.statusCode < 300) {
      final envelope =
          body is Map<String, dynamic> ? body : const <String, dynamic>{};
      final data = envelope['data'];
      return data is Map<String, dynamic> ? data : <String, dynamic>{};
    }

    final error =
        (body is Map<String, dynamic> && body['error'] is Map<String, dynamic>)
            ? body['error'] as Map<String, dynamic>
            : null;
    throw ApiException(
      statusCode: response.statusCode,
      code: error?['code']?.toString() ?? 'HTTP_${response.statusCode}',
      message: error?['message']?.toString() ??
          'Request failed (${response.statusCode})',
    );
  }
}
