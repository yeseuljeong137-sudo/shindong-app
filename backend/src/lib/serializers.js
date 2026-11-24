// DB 데이터를 Flutter 모델(fromJson)이 기대하는 JSON 모양으로 바꿔주는 함수 모음
// - ClubModel / BoardSummaryModel 은 snake_case (club_id, club_name ...)
// - BoardPostModel / BoardCommentModel 은 camelCase (postId, authorName ...)
// - 소식 피드, 알림, 홈 배너, 내 동아리는 화면에서 쓰던 Map 키 그대로

const { asArray } = require('./json');
const { timeAgo, formatDate, formatDateTime, formatShortDate, formatIsoDate } = require('./time');

// ───────── 회원 ─────────

function user(u) {
  return {
    st_id: u.stId,
    name: u.name,
    department: u.department,
    profile_img: u.profileImg,
    is_admin: u.isAdmin,
  };
}

// ───────── 동아리 (ClubModel) ─────────

function club(c, extra = {}) {
  return {
    club_id: c.id,
    club_name: c.name,
    category: c.category,
    is_recruiting: c.isRecruiting,
    recruit_deadline: formatIsoDate(c.recruitDeadline),
    description: c.description,
    logo_url: c.logoUrl,
    banner_url: c.bannerUrl,
    meeting_time: c.meetingTime,
    location: c.location,
    member_count: c._count?.memberships ?? 0,
    view_count: c.viewCount ?? 0,
    activities: asArray(c.activities),
    faqs: (c.faqs || []).map((f) => ({ faq_id: f.id, question: f.question, answer: f.answer })),
    news_images: extra.newsImages || [],
    ...(extra.isJoined !== undefined && { is_joined: extra.isJoined }),
    ...(extra.myRole !== undefined && { my_role: extra.myRole }),
    ...(extra.hasApplied !== undefined && { has_applied: extra.hasApplied }),
  };
}

// MyClubsScreen.joinedClubs 에 들어가던 Map 모양
function myClub(membership) {
  const c = membership.club;
  return {
    clubId: c.id,
    isRecruiting: c.isRecruiting,
    clubName: c.name,
    tag: c.category,
    meetingTime: c.meetingTime,
    location: c.location,
    logo: c.logoUrl,
    description: c.description,
    memberCount: c._count?.memberships ?? 0,
    role: membership.role, // PRESIDENT | MEMBER
    isPresident: membership.role === 'PRESIDENT',
    joinedAt: formatDate(membership.joinedAt),
  };
}

// BoardSummaryModel
function boardSummary(c, newPostCount) {
  return {
    club_id: c.id,
    club_name: c.name,
    category: c.category,
    member_count: c._count?.memberships ?? 0,
    logo_url: c.logoUrl,
    new_post_count: newPostCount,
    recent_posts: (c.posts || []).map((p) => ({
      post_id: p.id,
      title: p.title,
      time_ago: timeAgo(p.createdAt),
    })),
  };
}

// ───────── 게시판 (BoardPostModel / BoardCommentModel) ─────────

function attachment(a, index) {
  return {
    attachmentId: a.attachmentId ?? index + 1,
    fileName: a.fileName ?? '',
    fileUrl: a.fileUrl ?? '',
    fileSizeBytes: a.fileSizeBytes ?? 0,
    mimeType: a.mimeType ?? 'application/octet-stream',
    type: a.type === 'image' ? 'image' : 'file',
  };
}

function comment(cm, me) {
  return {
    commentId: cm.id,
    postId: cm.postId,
    authorName: cm.isAnonymous ? '익명' : cm.author?.name ?? '알 수 없음',
    isAnonymous: cm.isAnonymous,
    content: cm.content,
    timeAgo: timeAgo(cm.createdAt),
    likeCount: cm._count?.likes ?? 0,
    isLiked: me ? (cm.likes || []).some((l) => l.userId === me) : false,
    isMine: me ? cm.authorId === me : false,
  };
}

function post(p, me) {
  return {
    postId: p.id,
    clubId: p.clubId,
    boardCategory: p.boardCategory,
    title: p.title,
    content: p.content,
    authorName: p.isAnonymous ? '익명' : p.author?.name ?? '알 수 없음',
    isAnonymous: p.isAnonymous,
    timeAgo: timeAgo(p.createdAt),
    createdAt: p.createdAt,
    viewCount: p.viewCount,
    likeCount: p._count?.likes ?? 0,
    isLiked: me ? (p.likes || []).some((l) => l.userId === me) : false,
    isNotice: p.isNotice,
    isPinned: p.isPinned,
    isMine: me ? p.authorId === me : false,
    tags: asArray(p.tags),
    attachments: asArray(p.attachments).map(attachment),
    comments: (p.comments || []).map((cm) => comment(cm, me)),
    commentCount: p._count?.comments ?? (p.comments || []).length,
  };
}

// BoardPostDraftModel
function postDraft(d) {
  return {
    draftId: d.id,
    clubId: d.clubId,
    boardCategory: d.boardCategory,
    title: d.title,
    content: d.content,
    tags: asArray(d.tags),
    attachments: asArray(d.attachments).map(attachment),
    isPinned: d.isPinned,
    savedAt: formatDateTime(d.savedAt),
  };
}

// ───────── 동아리 소식 피드 (ClubNewsScreen.savedNewsList 의 Map 모양) ─────────

function newsComment(cm, me) {
  return {
    commentId: cm.id,
    user: cm.author?.name ?? '알 수 없음',
    time: timeAgo(cm.createdAt),
    text: cm.content,
    likes: cm._count?.likes ?? 0,
    isLiked: me ? (cm.likes || []).some((l) => l.userId === me) : false,
    isMine: me ? cm.authorId === me : false,
  };
}

function news(n, me) {
  const images = asArray(n.images);
  return {
    newsId: n.id,
    clubId: n.clubId,
    clubName: n.club?.name ?? '',
    clubLogo: n.club?.logoUrl ?? '',
    isPinned: n.isPinned,
    timeAgo: timeAgo(n.createdAt),
    image: images, // 화면은 List / String 둘 다 처리하므로 항상 List로 보냄
    content: n.content,
    likes: n._count?.likes ?? 0,
    isLiked: me ? (n.likes || []).some((l) => l.userId === me) : false,
    shareUrl: `shingu.club/feed/${n.clubId}/${n.id}`,
    comments: (n.comments || []).map((cm) => newsComment(cm, me)),
  };
}

function newsDraft(d) {
  return {
    draftId: d.id,
    clubId: d.clubId,
    clubName: d.club?.name ?? '',
    date: formatShortDate(d.savedAt),
    images: asArray(d.images),
    content: d.content,
  };
}

// ───────── 알림 ─────────

function notification(n) {
  return {
    notificationId: n.id,
    type: n.type,
    time: timeAgo(n.createdAt),
    title: n.title,
    content: n.content,
    timestamp: n.createdAt,
    isRead: n.isRead,
  };
}

const NOTIFICATION_SETTING_META = [
  { key: 'applicationResult', title: '지원 결과 알림', subtitle: '서류 심사 및 면접 결과 발표 알림' },
  { key: 'schedule', title: '스케줄 알림', subtitle: '다가오는 면접 일정 및 서류 제출 마감 기한' },
  { key: 'clubActivity', title: '동아리 활동 알림', subtitle: '내 동아리의 중요 일정 및 공지 사항' },
  { key: 'newFeed', title: '새 피드 알림', subtitle: '내 동아리 소식에 새로운 피드가 올라왔을 때' },
  { key: 'marketing', title: '마케팅 및 이벤트 알림', subtitle: '새로운 동아리 추천 및 이벤트 알림' },
];

function notificationSettings(s) {
  return NOTIFICATION_SETTING_META.map((m) => ({ ...m, enabled: !!s[m.key] }));
}

// ───────── 홈 배너 (HomeScreen._bannerData 의 Map 모양) ─────────

function banner(b) {
  const base = {
    bannerId: b.id,
    type: b.type,
    homeImage: b.homeImage,
    detailImage: b.detailImage,
    title: b.title,
    date: b.date,
    location: b.location,
    participants: b.participants,
    shareUrl: b.shareUrl,
    tags: asArray(b.tags),
  };
  if (b.type === 'club' && b.club) {
    const c = b.club;
    Object.assign(base, {
      clubId: c.id,
      isRecruiting: c.isRecruiting,
      title: c.name,
      tag: c.category,
      desc: c.description,
      clubImage: c.bannerUrl,
      logo: c.logoUrl,
      time: c.meetingTime,
      location: c.location,
      memberCount: c._count?.memberships ?? 0,
    });
  }
  return base;
}

// ───────── 지원 현황 (ApplicationStatusScreen 의 Map 모양) ─────────

const RESULT_TEXT = { ACCEPTED: '최종 합격', REJECTED: '불합격', CANCELED: '지원 취소' };

function applicationSteps(a, hasInterview) {
  if (hasInterview) {
    const steps = ['지원완료', '서류합격', '면접대기', '최종합격'];
    if (a.status === 'INTERVIEW') return { steps, currentStep: 2, statusText: '면접 대기' };
    return { steps, currentStep: 1, statusText: '서류심사중' };
  }
  return { steps: ['지원완료', '서류심사', '최종합격'], currentStep: 1, statusText: '서류심사중' };
}

// 진행 중인 지원 (SUBMITTED, INTERVIEW)
function applicationInProgress(a) {
  return {
    applicationId: a.id,
    clubId: a.clubId,
    clubName: a.club.name,
    logo: a.club.logoUrl,
    status: a.status,
    ...applicationSteps(a, a.club.hasInterview),
    noticeTitle: a.noticeTitle,
    noticeDetail: a.noticeDetail,
    appliedDate: formatDate(a.createdAt),
  };
}

// 지난 이력 (ACCEPTED, REJECTED, CANCELED)
function applicationHistory(a) {
  return {
    applicationId: a.id,
    clubId: a.clubId,
    clubName: a.club.name,
    category: a.club.category,
    logo: a.club.logoUrl,
    status: a.status,
    result: RESULT_TEXT[a.status] ?? a.status,
    appliedDate: formatDate(a.createdAt),
  };
}

module.exports = {
  user,
  club,
  myClub,
  boardSummary,
  post,
  comment,
  postDraft,
  news,
  newsComment,
  newsDraft,
  notification,
  notificationSettings,
  NOTIFICATION_SETTING_META,
  banner,
  applicationInProgress,
  applicationHistory,
};
