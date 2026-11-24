// 초기 데이터 넣기: npx prisma db seed  (또는 npm run db:reset 하면 DB 초기화 + seed 자동 실행)
// Flutter 앱에 하드코딩돼 있던 목업 데이터(동아리 12개, 게시글, 소식, 배너, 알림, 지원 현황)를 그대로 DB에 넣음
//
// 테스트 계정
//   김신구 (HelloWorld 회장, 오프레임 회원)  학번 20241234 / 비밀번호 1234
//   관리자 (동아리 개설 요청 승인)          학번 000000   / 비밀번호 admin1234
//   그 밖의 모든 계정 비밀번호는 1234

const { PrismaClient } = require('@prisma/client');
const { hashPassword } = require('../src/lib/password');
const clubs = require('./seed-data/clubs.json');

const prisma = new PrismaClient();

// "10분 전", "2시간 전", "1일 전" → Date
function ago(text) {
  const n = Number((text.match(/\d+/) || [0])[0]);
  const unit = text.includes('분') ? 60e3 : text.includes('시간') ? 3600e3 : text.includes('일') ? 86400e3 : 0;
  return new Date(Date.now() - n * unit);
}

const FAMILY = ['김', '이', '박', '최', '정', '강', '조', '윤', '장', '임', '한', '오', '서', '신', '권', '황'];
const GIVEN = ['민준', '서연', '도윤', '지우', '하준', '서윤', '시우', '하은', '주원', '지민', '예준', '수아', '유진', '현우', '다은', '준서', '채원', '건우', '소율', '태윤'];
const DEPTS = ['소프트웨어학과', '경영학과', '디자인학과', '미디어콘텐츠과', '사회복지과', '체육학과', '전자공학과', '간호학과'];

async function main() {
  console.log('🧹 기존 데이터 삭제');
  await prisma.banner.deleteMany();
  await prisma.appFaq.deleteMany();
  await prisma.user.deleteMany(); // 회원에 딸린 데이터는 Cascade로 같이 삭제
  await prisma.club.deleteMany();

  const pw = hashPassword('1234');

  // ───── 회원 ─────
  console.log('👤 회원 생성');
  const me = await prisma.user.create({
    data: { stId: '20241234', passwordHash: pw, name: '김신구', department: '소프트웨어학과', notificationSetting: { create: {} } },
  });
  await prisma.user.create({
    data: { stId: '000000', passwordHash: hashPassword('admin1234'), name: '앱 관리자', isAdmin: true, notificationSetting: { create: {} } },
  });
  const named = {};
  for (const [stId, name, department] of [
    ['20231001', '박시현', '소프트웨어학과'],
    ['20231002', '이도현', '소프트웨어학과'],
    ['20251003', '이수민', '미디어콘텐츠과'],
    ['20251004', '박지훈', '체육학과'],
  ]) {
    named[name] = await prisma.user.create({
      data: { stId, passwordHash: pw, name, department, notificationSetting: { create: {} } },
    });
  }

  // 회원 수를 목업과 비슷하게 맞추기 위한 일반 학생 60명
  const fillers = [];
  for (let i = 0; i < 60; i++) {
    fillers.push(
      await prisma.user.create({
        data: {
          stId: String(20250100 + i),
          passwordHash: pw,
          name: FAMILY[i % FAMILY.length] + GIVEN[(i * 7) % GIVEN.length],
          department: DEPTS[i % DEPTS.length],
        },
      }),
    );
  }

  // ───── 동아리 ─────
  console.log('🏫 동아리 12개 생성');
  const presidents = {};
  for (const c of clubs) {
    await prisma.club.create({
      data: {
        id: c.id, // Flutter 쪽에서 clubId를 직접 쓰는 곳이 있어서 1~12 고정
        name: c.name,
        category: c.category,
        description: c.description,
        logoUrl: c.logoUrl,
        bannerUrl: c.bannerUrl,
        meetingTime: c.meetingTime,
        location: c.location,
        isRecruiting: c.isRecruiting,
        recruitDeadline: c.recruitDeadline ? new Date(`${c.recruitDeadline}T23:59:59+09:00`) : null,
        hasInterview: c.id !== 12, // 아리아는 서류 → 최종합격 (면접 없음)
        activities: c.activities,
        faqs: { create: c.faqs },
      },
    });

    // 회장: HelloWorld는 김신구, 나머지는 회장 계정을 따로 만듦
    let president = me;
    if (c.id !== 1) {
      president = await prisma.user.create({
        data: {
          stId: String(20230200 + c.id),
          passwordHash: pw,
          name: `${FAMILY[(c.id * 3) % FAMILY.length]}${GIVEN[(c.id * 5) % GIVEN.length]}`,
          department: DEPTS[c.id % DEPTS.length],
          notificationSetting: { create: {} },
        },
      });
    }
    presidents[c.id] = president;
    await prisma.membership.create({
      data: {
        userId: president.id,
        clubId: c.id,
        role: 'PRESIDENT',
        joinedAt: c.id === 1 ? new Date('2025-03-15T10:00:00+09:00') : undefined, // 내 동아리 목록에서 HelloWorld가 먼저 오도록
      },
    });
  }

  // ───── 모집 공고 (re) ─────
  console.log('📢 모집 공고 생성');
  const reByClub = {}; // clubId → 진행 중인 모집
  for (const c of clubs) {
    // 지난 학기 모집(마감)
    await prisma.recruitment.create({
      data: {
        clubId: c.id,
        reDate: new Date('2026-03-02T00:00:00+09:00'),
        deadlineDate: new Date('2026-03-16T23:59:59+09:00'),
        statusCode: 'CLOSED',
      },
    });
    // 이번 모집(진행 중)
    if (c.isRecruiting) {
      reByClub[c.id] = await prisma.recruitment.create({
        data: {
          clubId: c.id,
          reDate: new Date('2026-11-16T00:00:00+09:00'),
          deadlineDate: c.recruitDeadline ? new Date(`${c.recruitDeadline}T23:59:59+09:00`) : null,
        },
      });
    }
  }

  // ───── 소속 ─────
  console.log('🤝 동아리 회원 연결');
  await prisma.membership.createMany({
    data: [
      { userId: me.id, clubId: 9, role: 'MEMBER', joinedAt: new Date('2025-12-15T10:00:00+09:00') },
      { userId: named['박시현'].id, clubId: 1, role: 'MEMBER' },
      { userId: named['이도현'].id, clubId: 1, role: 'MEMBER' },
      { userId: named['이수민'].id, clubId: 7, role: 'MEMBER' },
      { userId: named['박지훈'].id, clubId: 7, role: 'MEMBER' },
    ],
  });
  const clubMembers = {}; // clubId → 일반 회원 목록 (좋아요/댓글 작성자로 사용)
  for (const c of clubs) {
    const already = await prisma.membership.count({ where: { clubId: c.id } });
    const need = Math.max(0, Math.min(c.memberCount - already, fillers.length));
    const offset = (c.id * 11) % fillers.length;
    const picked = Array.from({ length: need }, (_, i) => fillers[(offset + i) % fillers.length]);
    clubMembers[c.id] = picked;
    await prisma.membership.createMany({ data: picked.map((u) => ({ userId: u.id, clubId: c.id })) });
  }

  const likeBy = (users, n) => users.slice(0, Math.min(n, users.length));

  // ───── 게시판 ─────
  console.log('📝 게시글 생성');
  async function createPost({ clubId, author, likes = 0, comments = [], ...data }) {
    const post = await prisma.post.create({ data: { clubId, authorId: author.id, ...data } });
    const likers = likeBy(clubMembers[clubId], likes);
    if (likers.length) await prisma.postLike.createMany({ data: likers.map((u) => ({ userId: u.id, postId: post.id })) });
    for (const cm of comments) {
      const comment = await prisma.comment.create({
        data: { postId: post.id, authorId: cm.author.id, content: cm.content, isAnonymous: !!cm.isAnonymous, createdAt: ago(cm.ago) },
      });
      const cl = likeBy(clubMembers[clubId].slice(5), cm.likes || 0);
      if (cl.length) await prisma.commentLike.createMany({ data: cl.map((u) => ({ userId: u.id, commentId: comment.id })) });
    }
    return post;
  }

  const hw = clubMembers[1];
  // HelloWorld 게시판 (board_repository.dart 목업)
  await createPost({
    clubId: 1, author: hw[0], isAnonymous: true, boardCategory: '자유게시판', title: '백엔드 파트',
    content: '이번에 백엔드 파트 지원하려는데 코딩테스트 보나요??', createdAt: ago('2시간 전'), viewCount: 64, likes: 18,
    tags: ['백엔드', '지원문의'],
    comments: [{ author: named['박시현'], content: '별도 코딩테스트 없이 지원서와 간단한 면접으로 진행됩니다!', ago: '1시간 전', likes: 4 }],
  });
  await createPost({
    clubId: 1, author: hw[1], isAnonymous: true, boardCategory: '자유게시판', title: '헬로월드 분위기',
    content: '이번 신입생인데 헬로월드 동아리 분위기 어떤가요', createdAt: ago('15시간 전'), viewCount: 91, likes: 12,
    tags: ['신입생', '분위기'],
    comments: [{ author: hw[2], isAnonymous: true, content: '스터디랑 프로젝트 분위기 모두 편하고 선배들이 잘 알려줘요!', ago: '12시간 전', likes: 3 }],
  });
  await createPost({
    clubId: 1, author: named['이도현'], boardCategory: '공지사항', title: '작년 공모전 대회 수상 실적 공유합니다!',
    content:
      '안녕하세요, HelloWorld입니다! 지난 학기 교내 캡스톤 경진대회에서 저희 팀이 최우수상을 수상했습니다. 기획부터 개발, 발표까지 함께 달린 팀원들의 경험을 정리해 공유합니다. 다음 공모전을 준비하는 분들께 도움이 되길 바랍니다.',
    createdAt: ago('1일 전'), viewCount: 142, likes: 30, isNotice: true, isPinned: true, tags: ['공모전', '캡스톤', '수상후기'],
    attachments: [
      { fileName: '2026_공모전_회고.pdf', fileUrl: 'https://shingu.club/files/2026_공모전_회고.pdf', fileSizeBytes: 2516582, mimeType: 'application/pdf', type: 'file' },
    ],
    comments: [
      { author: me, content: '자료 공유 감사합니다! 발표 준비 파트가 특히 도움이 됐어요.', ago: '20시간 전', likes: 2 },
      { author: hw[3], isAnonymous: true, content: '다음 공모전 모집 일정도 올라오나요?', ago: '18시간 전', likes: 1 },
      { author: named['이도현'], content: '다음 주 중으로 공지사항 게시판에 팀 빌딩 일정 업로드 예정입니다!', ago: '15시간 전', likes: 3 },
    ],
  });
  await createPost({
    clubId: 1, author: hw[4], isAnonymous: true, boardCategory: '자유게시판', title: '오늘 동방 열려있나요??',
    content: 'ㅈㄱㄴ', createdAt: ago('1일 전'), viewCount: 38, likes: 1,
    comments: [{ author: hw[5], isAnonymous: true, content: '네 오후 6시까지 열려있습니다!', ago: '1일 전' }],
  });

  // 모든 동아리: 게시판 탭 미리보기 글 2개 + (HelloWorld 외) 고정 공지 1개
  for (const c of clubs) {
    for (const [i, rp] of c.recentPosts.entries()) {
      const isNotice = /공지|안내/.test(rp.title);
      await createPost({
        clubId: c.id, author: presidents[c.id], boardCategory: isNotice ? '공지사항' : '자유게시판', title: rp.title,
        content: `${rp.title}\n\n자세한 내용은 운영진에게 문의해 주세요.`, isNotice, createdAt: ago(rp.timeAgo),
        viewCount: 20 + i * 7, likes: 3 + i * 2,
      });
    }
    if (c.id !== 1) {
      await createPost({
        clubId: c.id, author: presidents[c.id], boardCategory: '공지사항', title: `${c.name} 2학기 정기 활동 안내`,
        content: `안녕하세요, ${c.name} 운영진입니다. 이번 학기 정기 모임 및 주요 일정 안내드립니다.`,
        isNotice: true, isPinned: true, createdAt: ago('1일 전'), viewCount: 85, likes: 19, tags: ['정기모임', '공지'],
      });
    }
  }

  await prisma.postDraft.create({
    data: {
      clubId: 1, authorId: me.id, boardCategory: '자유게시판', title: '이번 주 금요일 스터디 회고 정리',
      content: 'Flutter 상태 관리 및 REST API 연동 실습 내용을 정리 중입니다.', tags: ['스터디', 'Flutter'],
      savedAt: new Date('2026-11-17T14:10:00+09:00'),
    },
  });

  // ───── 동아리 소식 피드 ─────
  console.log('📸 소식 피드 생성');
  async function createNews({ clubId, likes = 0, comments = [], ...data }) {
    const n = await prisma.newsPost.create({ data: { clubId, authorId: presidents[clubId].id, ...data } });
    const likers = likeBy(clubMembers[clubId], likes);
    if (likers.length) await prisma.newsLike.createMany({ data: likers.map((u) => ({ userId: u.id, newsId: n.id })) });
    for (const cm of comments) {
      await prisma.newsComment.create({ data: { newsId: n.id, authorId: cm.author.id, content: cm.text, createdAt: ago(cm.ago) } });
    }
  }
  await createNews({
    clubId: 7, images: ['assets/images/news1.png', 'assets/images/news2.png'], createdAt: ago('12분 전'), likes: 23,
    content: '🔥 오늘자 중앙동아리 신입 부원 1차 오리엔테이션 현장! 다들 너무 잘 춰서 깜짝 놀랐습니다. 앞으로 함께할 무대가 기대돼요!',
    comments: [
      { author: named['이수민'], text: '현장 분위기 정말 좋았어요! 금요일 버스킹도 꼭 보러 갈게요 🙌', ago: '10분 전' },
      { author: named['박지훈'], text: '신입 부원분들 벌써 합이 너무 좋네요. 디포스 파이팅!', ago: '8분 전' },
    ],
  });
  await createNews({
    clubId: 7, images: ['assets/images/news2.png'], createdAt: ago('3시간 전'), likes: 19,
    content: '이번 주 버스킹 라인업 공개합니다! 다들 연습 열심히 하고 있으니 금요일에 만나요 🙌',
  });
  for (const c of clubs.filter((x) => x.id !== 7)) {
    await createNews({
      clubId: c.id, images: [c.bannerUrl], createdAt: ago(`${(c.id % 3) + 1}일 전`), likes: 10 + c.id,
      content: `${c.name} 동아리 활동 소식입니다. 많은 관심 부탁드립니다! ✨`,
    });
  }

  // ───── 지원 현황 (김신구) ─────
  console.log('📨 지원 내역 생성');
  const sampleAnswers = {
    motive: '동아리 활동을 통해 함께 성장하고 싶습니다.', interests: ['아직 탐색 중'], tools: '없음',
    experience: '관련 경험은 많지 않지만 열심히 배우겠습니다.', preparation: '꾸준히 참여할 수 있는 시간을 확보했습니다.',
  };
  const apps = [
    { clubId: 5, status: 'INTERVIEW', noticeTitle: '면접 안내 일정', noticeDetail: '3월 18일 (화) 15:30 | 산학협력관 4층 대회의실', createdAt: ago('5일 전') },
    { clubId: 12, status: 'SUBMITTED', noticeTitle: '서류 발표 일정', noticeDetail: '3월 21일 (금) 12:30 | 4층 대회의실', createdAt: ago('2일 전') },
    { clubId: 1, status: 'ACCEPTED', createdAt: new Date('2026-03-10T10:00:00+09:00') },
    { clubId: 10, status: 'REJECTED', createdAt: new Date('2026-02-27T10:00:00+09:00') },
    { clubId: 9, status: 'ACCEPTED', createdAt: new Date('2025-12-08T10:00:00+09:00') },
    { clubId: 7, status: 'CANCELED', createdAt: new Date('2025-03-02T10:00:00+09:00') },
  ];
  const inProgress = (status) => ['SUBMITTED', 'INTERVIEW'].includes(status);
  for (const a of apps) {
    await prisma.application.create({
      data: { userId: me.id, answers: sampleAnswers, recruitmentId: inProgress(a.status) ? reByClub[a.clubId]?.id : null, ...a },
    });
  }

  // 회장(김신구)이 심사할 수 있게 HelloWorld 지원서 2건
  for (const [i, u] of fillers.slice(5, 7).entries()) { // HelloWorld 회원이 아닌 학생
    await prisma.application.create({
      data: {
        userId: u.id, clubId: 1, createdAt: ago(`${i + 1}일 전`), recruitmentId: reByClub[1]?.id,
        answers: { ...sampleAnswers, interests: i ? ['백엔드'] : ['프론트엔드', 'UI / UX'], tools: i ? 'Java, Spring' : 'HTML, CSS, Figma' },
      },
    });
  }

  // ───── 회비 / 장부 (HelloWorld) ─────
  console.log('💰 회비 / 장부 생성');
  const payers = [me, named['박시현'], named['이도현'], ...hw.slice(0, 5)];
  for (const [i, u] of payers.entries()) {
    await prisma.due.create({
      data: { clubId: 1, userId: u.id, amount: 20000, paidAt: new Date(`2026-09-0${(i % 7) + 1}T19:00:00+09:00`) },
    });
  }
  await prisma.accountBook.createMany({
    data: [
      { clubId: 1, amount: payers.length * 20000, description: '2학기 회비 수입', createdAt: new Date('2026-09-08T10:00:00+09:00') },
      { clubId: 1, amount: -45000, description: '개강 총회 간식비', proofImg: 'assets/images/helloworld.png', createdAt: new Date('2026-09-10T20:00:00+09:00') },
      { clubId: 1, amount: -60000, description: '해커톤 참가비 (3팀)', createdAt: new Date('2026-10-02T12:00:00+09:00') },
      { clubId: 1, amount: 30000, description: '학과 지원금', createdAt: new Date('2026-10-15T09:00:00+09:00') },
    ],
  });

  // ───── 알림 (김신구) ─────
  await prisma.notification.createMany({
    data: [
      { userId: me.id, type: '지원 상태', title: '<HelloWorld> 서류 합격', content: '축하해요! 9월 29일 면접 일정과 준비 사항을 확인해 주세요.', createdAt: ago('10분 전') },
      { userId: me.id, type: '마감 임박', title: '<아리아> 모집이 오늘 마감돼요', content: '지원서 임시 저장 내용이 있어요. 오늘 18시 전에 제출해 주세요.', createdAt: ago('1시간 전') },
      { userId: me.id, type: '지원 상태', title: '<신구FC>가 지원서를 확인했어요', content: '결과가 등록되면 바로 알려드릴게요.', createdAt: ago('1일 전') },
    ],
  });

  // ───── 홈 배너 ─────
  console.log('🏠 배너 / FAQ 생성');
  await prisma.banner.createMany({
    data: [
      {
        type: 'banner', sortOrder: 1, homeImage: 'assets/images/banner1.png', detailImage: 'assets/images/banner_detail1.png',
        title: '2026 동아리 연합 축제', date: '2026. 11. 3(화) 12:00-20:00', location: '신구대학교 운동장 · 국제관 앞 광장',
        participants: '중앙동아리 18팀 · 신구대생 누구나', shareUrl: 'shingu.club/banner/20261103/festival',
        tags: ['HelloWorld', '디포스', 'ORANGE', '아리아', '오프레임', '+13'],
      },
      {
        type: 'banner', sortOrder: 2, homeImage: 'assets/images/banner2.png', detailImage: 'assets/images/banner_detail2.png',
        title: 'SW중심대학 연합 해커톤 2026', date: '2026. 10. 29 (토) 12:00-20:00', location: '신구대학교 남관 402호',
        participants: '신구대생 누구나', shareUrl: 'shingu.club/banner/20261029/hackathon', tags: [],
      },
      { type: 'club', sortOrder: 3, homeImage: 'assets/images/banner3.png', title: 'CUBE (큐브)', clubId: 2 },
    ],
  });

  // ───── 앱 FAQ (faq_screen.dart) ─────
  await prisma.appFaq.createMany({
    data: [
      ['동아리는 어디에서 찾아볼 수 있나요?', '탐색에서 관심 있는 동아리를 찾아보세요.\n동아리를 선택하면 상세 정보를 볼 수 있어요.'],
      ['동아리에 지원하려면 어떻게 하나요?', '동아리 상세 정보에서 모집 내용을 확인한 뒤\n지원서를 작성해 제출해 주세요.'],
      ['지원 현황은 어디에서 확인하나요?', '마이 페이지의 ‘지원 현황’에서 지원 내역과\n진행 상태를 확인할 수 있어요.'],
      ['알림은 어디에서 설정하나요?', '마이 페이지의 ‘알림 설정’을 확인해 주세요.\n기기 설정에서도 앱의 알림 권한을 확인해요.'],
      ['내 정보는 어디에서 확인하나요?', '마이 페이지 상단에서 이름, 학과, 학번을\n확인할 수 있어요.'],
    ].map(([question, answer], i) => ({ question, answer, sortOrder: i + 1 })),
  });

  // PostgreSQL로 바꿨을 때: 동아리 id를 직접 넣었으므로 자동 증가 번호를 맞춰 줌
  if ((process.env.DATABASE_URL || '').startsWith('postgres')) {
    await prisma.$executeRawUnsafe(`SELECT setval(pg_get_serial_sequence('club', 'club_id'), (SELECT MAX(club_id) FROM club))`);
  }

  const counts = {
    users: await prisma.user.count(),
    clubs: await prisma.club.count(),
    posts: await prisma.post.count(),
    news: await prisma.newsPost.count(),
  };
  console.log('✅ 완료', counts);
  console.log('   테스트 계정: 20241234 / 1234 (김신구, HelloWorld 회장)   관리자: 000000 / admin1234');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
