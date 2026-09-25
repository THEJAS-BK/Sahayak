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
  ApiClient._();

  static final ApiClient instance = ApiClient._();

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
        await SessionService.instance.updateTokens(
          data['access_token']?.toString() ?? '',
          data['refresh_token']?.toString(),
        );
        return true;
      }
    } catch (_) {
      // fall through to clearing the session below
    }
    await SessionService.instance.clear();
    return false;
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
