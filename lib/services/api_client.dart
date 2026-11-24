import 'dart:convert';

import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

import '../config/api_config.dart';

/// 서버가 돌려준 에러 ({ "message": "..." })
class ApiException implements Exception {
  final int statusCode;
  final String message;

  const ApiException(this.statusCode, this.message);

  bool get isUnauthorized => statusCode == 401;

  @override
  String toString() => message;
}

/// 백엔드와 통신하는 공통 클라이언트
/// - 로그인 토큰을 저장해 두고 모든 요청에 Authorization 헤더로 붙여줌
/// - 응답 JSON을 Map / List 로 돌려줌
class ApiClient {
  ApiClient._();
  static final ApiClient instance = ApiClient._();

  static const String _tokenKey = 'auth_token';
  final http.Client _http = http.Client();
  String? _token;

  bool get isLoggedIn => _token != null;

  Future<void> loadToken() async {
    final prefs = await SharedPreferences.getInstance();
    _token = prefs.getString(_tokenKey);
  }

  Future<void> setToken(String? token) async {
    _token = token;
    final prefs = await SharedPreferences.getInstance();
    if (token == null) {
      await prefs.remove(_tokenKey);
    } else {
      await prefs.setString(_tokenKey, token);
    }
  }

  Future<dynamic> get(String path, {Map<String, String?>? query}) =>
      _send('GET', path, query: query);

  Future<dynamic> post(String path, {Object? body}) =>
      _send('POST', path, body: body);

  Future<dynamic> patch(String path, {Object? body}) =>
      _send('PATCH', path, body: body);

  Future<dynamic> put(String path, {Object? body}) =>
      _send('PUT', path, body: body);

  Future<dynamic> delete(String path, {Object? body}) =>
      _send('DELETE', path, body: body);

  Future<dynamic> _send(
    String method,
    String path, {
    Map<String, String?>? query,
    Object? body,
  }) async {
    var uri = Uri.parse('${ApiConfig.baseUrl}$path');
    final cleanQuery = <String, String>{
      for (final e in (query ?? const <String, String?>{}).entries)
        if (e.value != null && e.value!.isNotEmpty) e.key: e.value!,
    };
    if (cleanQuery.isNotEmpty) uri = uri.replace(queryParameters: cleanQuery);

    final request = http.Request(method, uri);
    request.headers['Content-Type'] = 'application/json';
    if (_token != null) request.headers['Authorization'] = 'Bearer $_token';
    if (body != null) request.body = jsonEncode(body);

    final http.Response res;
    try {
      final streamed =
          await _http.send(request).timeout(const Duration(seconds: 10));
      res = await http.Response.fromStream(streamed);
    } catch (_) {
      throw const ApiException(
        0,
        '서버에 연결할 수 없어요. 백엔드 서버(npm run dev)가 켜져 있는지 확인해 주세요.',
      );
    }

    final text = utf8.decode(res.bodyBytes);
    dynamic data;
    if (text.isNotEmpty) {
      try {
        data = jsonDecode(text);
      } catch (_) {
        data = null;
      }
    }

    if (res.statusCode >= 400) {
      if (res.statusCode == 401 && _token != null) {
        // 토큰 만료 → 저장된 토큰 삭제 (다음 실행 때 로그인 화면으로)
        await setToken(null);
      }
      final message = data is Map && data['message'] != null
          ? data['message'].toString()
          : '요청에 실패했어요. (${res.statusCode})';
      throw ApiException(res.statusCode, message);
    }
    return data;
  }
}

/// JSON 변환 도우미
List<Map<String, dynamic>> asJsonList(dynamic data) {
  if (data is! List) return [];
  return data.whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList();
}

Map<String, dynamic> asJsonMap(dynamic data) {
  if (data is Map) return Map<String, dynamic>.from(data);
  return {};
}
