import 'api_client.dart';
import 'club_repository.dart';

/// 로그인 상태 관리
class AuthService {
  AuthService._();
  static final AuthService instance = AuthService._();

  final ApiClient _api = ApiClient.instance;

  /// 로그인한 사용자 { st_id, name, department, profile_img, is_admin }
  Map<String, dynamic>? currentUser;

  bool get isLoggedIn => _api.isLoggedIn;
  String get userName => currentUser?['name']?.toString() ?? '';

  /// 앱 시작 시: 저장된 토큰이 있으면 자동 로그인
  Future<bool> restoreSession() async {
    await _api.loadToken();
    if (!_api.isLoggedIn) return false;
    try {
      final data = asJsonMap(await _api.get('/api/auth/me'));
      currentUser = asJsonMap(data['user']);
      await ClubRepository.instance.refreshJoinedClubs();
      return true;
    } on ApiException catch (e) {
      if (e.isUnauthorized) return false; // 토큰 만료 → 로그인 화면
      return true; // 서버가 잠깐 꺼져 있어도 일단 메인으로 (화면에서 에러 표시)
    }
  }

  /// 학번 + 비밀번호 로그인
  Future<void> login(String stId, String password) async {
    final data = asJsonMap(
      await _api.post(
        '/api/auth/login',
        body: {'stId': stId.trim(), 'password': password},
      ),
    );
    await _api.setToken(data['token']?.toString());
    currentUser = asJsonMap(data['user']);
    await ClubRepository.instance.refreshJoinedClubs();
  }

  Future<void> logout() async {
    await _api.setToken(null);
    currentUser = null;
    await ClubRepository.instance.refreshJoinedClubs(); // 목록 비우기
  }
}
