import '../config/app_role.dart';
import '../models/club_models.dart';
import '../screens/common/my_clubs_screen.dart';
import 'api_client.dart';

typedef ClubList = List<ClubModel>;
typedef BoardSummaryList = List<BoardSummaryModel>;

/// 동아리 데이터 (백엔드 /api/clubs ...)
class ClubRepository {
  ClubRepository._();
  static final ClubRepository instance = ClubRepository._();

  final ApiClient _api = ApiClient.instance;

  Set<int> get joinedClubIds {
    return MyClubsScreen.joinedClubs
        .map((club) => club['clubId'] as int? ?? 0)
        .where((id) => id != 0)
        .toSet();
  }

  bool isClubJoined(int clubId) {
    return joinedClubIds.contains(clubId);
  }

  /// 내 동아리 목록을 서버에서 다시 받아와 MyClubsScreen.joinedClubs 와 AppRole 을 갱신
  /// (로그인 직후, 앱 시작 시, 탈퇴/합격 후 호출)
  Future<void> refreshJoinedClubs() async {
    if (!_api.isLoggedIn) {
      MyClubsScreen.joinedClubs.clear();
      AppRole.presidentClubIds = {};
      AppRole.isPresident = false;
      MyClubsScreen.clubsNotifier.notify();
      return;
    }
    final list = asJsonList(await _api.get('/api/clubs/me/joined'));
    MyClubsScreen.joinedClubs
      ..clear()
      ..addAll(list);
    AppRole.presidentClubIds = list
        .where((c) => c['isPresident'] == true)
        .map((c) => c['clubId'] as int)
        .toSet();
    AppRole.isPresident = AppRole.presidentClubIds.isNotEmpty;
    MyClubsScreen.clubsNotifier.notify();
  }

  /// 동아리 탈퇴
  Future<void> withdrawClub(int clubId, String reason) async {
    await _api.delete('/api/clubs/$clubId/membership', body: {'reason': reason});
    await refreshJoinedClubs();
  }

  Future<ClubList> fetchClubs({String? category, String? query}) async {
    final list = asJsonList(
      await _api.get('/api/clubs', query: {'category': category, 'q': query}),
    );
    return list.map(ClubModel.fromJson).toList();
  }

  Future<ClubModel> fetchClubDetail(int clubId) async {
    return ClubModel.fromJson(asJsonMap(await _api.get('/api/clubs/$clubId')));
  }

  /// 동아리 상세 원본 JSON (is_joined, my_role, has_applied 등 ClubModel에 없는 값까지 필요할 때)
  Future<Map<String, dynamic>> fetchClubDetailRaw(int clubId) async {
    return asJsonMap(await _api.get('/api/clubs/$clubId'));
  }

  Future<BoardSummaryList> fetchAllBoardSummaries() async {
    final list = asJsonList(
      await _api.get('/api/clubs/boards/summaries', query: {'scope': 'all'}),
    );
    return list.map(BoardSummaryModel.fromJson).toList();
  }

  Future<BoardSummaryList> fetchMyBoardSummaries() async {
    if (!_api.isLoggedIn) return [];
    final list = asJsonList(
      await _api.get('/api/clubs/boards/summaries', query: {'scope': 'mine'}),
    );
    return list.map(BoardSummaryModel.fromJson).toList();
  }
}
