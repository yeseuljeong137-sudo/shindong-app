import 'api_client.dart';

/// 동아리 지원 (백엔드 /api/clubs/:clubId/applications, /api/applications ...)
class ApplicationRepository {
  ApplicationRepository._();
  static final ApplicationRepository instance = ApplicationRepository._();

  final ApiClient _api = ApiClient.instance;

  /// 지원서 제출
  Future<Map<String, dynamic>> submit(
    int clubId, {
    required String motive,
    required List<String> interests,
    required String tools,
    required String experience,
    required String preparation,
  }) async {
    return asJsonMap(
      await _api.post(
        '/api/clubs/$clubId/applications',
        body: {
          'motive': motive,
          'interests': interests,
          'tools': tools,
          'experience': experience,
          'preparation': preparation,
        },
      ),
    );
  }

  /// 내 지원 현황 → (진행 중, 지난 이력)
  /// 각 항목은 ApplicationStatusScreen 이 쓰던 Map 모양
  Future<({List<Map<String, dynamic>> inProgress, List<Map<String, dynamic>> history})>
  fetchMine() async {
    final data = asJsonMap(await _api.get('/api/applications/me'));
    return (
      inProgress: asJsonList(data['inProgress']),
      history: asJsonList(data['history']),
    );
  }

  /// 지원 취소
  Future<void> cancel(int applicationId) async {
    await _api.patch('/api/applications/$applicationId/cancel');
  }
}
