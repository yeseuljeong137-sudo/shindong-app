class AppRole {
  // true: 회장 UI / false: 회원 UI
  // 로그인하면 서버에서 받은 정보로 자동 설정됨 (회장인 동아리가 하나라도 있으면 true)
  static bool isPresident = false;

  // 내가 회장인 동아리 id 목록 (ClubRepository.refreshJoinedClubs()에서 채움)
  static Set<int> presidentClubIds = {};

  /// 이 동아리의 회장인지
  static bool isPresidentOf(int clubId) => presidentClubIds.contains(clubId);
}
