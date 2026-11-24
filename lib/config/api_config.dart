import 'package:flutter/foundation.dart';

/// 백엔드(club-backend) 서버 주소 설정
///
/// - iOS 시뮬레이터 / 웹 / macOS: http://localhost:3000
/// - 안드로이드 에뮬레이터: http://10.0.2.2:3000 (에뮬레이터에서 맥을 가리키는 주소)
/// - 실제 폰으로 테스트할 때는 맥의 와이파이 IP로 실행:
///   flutter run --dart-define=API_BASE_URL=http://192.168.0.12:3000
/// - 배포(AWS 등)에서 서버가 웹 앱도 같이 제공할 때는 같은 주소로 요청:
///   flutter build web --dart-define=API_SAME_ORIGIN=true
class ApiConfig {
  static const String _override = String.fromEnvironment('API_BASE_URL');
  static const bool _sameOrigin = bool.fromEnvironment('API_SAME_ORIGIN');

  static String get baseUrl {
    if (_override.isNotEmpty) return _override;
    if (kIsWeb && _sameOrigin) return Uri.base.origin; // 지금 열려 있는 페이지 주소
    if (kIsWeb) return 'http://localhost:3000';
    if (defaultTargetPlatform == TargetPlatform.android) {
      return 'http://10.0.2.2:3000';
    }
    return 'http://localhost:3000';
  }

  /// "/uploads/..." 같은 서버 경로를 전체 URL로 바꿔줌
  static String resolveUrl(String path) {
    if (path.startsWith('http://') || path.startsWith('https://')) return path;
    return '$baseUrl$path';
  }
}
