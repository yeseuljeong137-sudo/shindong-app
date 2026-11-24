// 동아리: 탐색, 상세, 내 동아리, 탈퇴, 게시판 목록 요약, 회원 관리
const express = require('express');
const prisma = require('../lib/prisma');
const { ah, HttpError, toId } = require('../lib/http');
const { asArray, cleanStringArray } = require('../lib/json');
const { requireAuth, optionalAuth, getMembership, assertClubExists, assertPresident } = require('../middleware/auth');
const s = require('../lib/serializers');

const router = express.Router();

const withCount = { _count: { select: { memberships: true } } };

// GET /api/clubs?category=학술&q=헬로  — 탐색 화면 (ExploreScreen)
router.get(
  '/',
  ah(async (req, res) => {
    const { category, q } = req.query;
    const where = {};
    if (category && category !== '전체') where.category = String(category);
    if (q && String(q).trim()) {
      const keyword = String(q).trim();
      where.OR = [{ name: { contains: keyword } }, { description: { contains: keyword } }];
    }
    const clubs = await prisma.club.findMany({
      where,
      include: { ...withCount, faqs: true },
      orderBy: { id: 'asc' },
    });
    res.json(clubs.map((c) => s.club(c)));
  }),
);

// GET /api/clubs/me/joined — 내 동아리 (MyClubsScreen.joinedClubs 대체)
router.get(
  '/me/joined',
  requireAuth,
  ah(async (req, res) => {
    const memberships = await prisma.membership.findMany({
      where: { userId: req.user.id },
      include: { club: { include: withCount } },
      orderBy: { joinedAt: 'asc' },
    });
    res.json(memberships.map(s.myClub));
  }),
);

// GET /api/clubs/boards/summaries?scope=mine|all — 게시판 탭 (BoardScreen)
router.get(
  '/boards/summaries',
  optionalAuth,
  ah(async (req, res) => {
    const scope = req.query.scope === 'mine' ? 'mine' : 'all';
    const where = {};
    if (scope === 'mine') {
      if (!req.user) throw new HttpError(401, '로그인이 필요합니다.');
      where.memberships = { some: { userId: req.user.id } };
    }
    const clubs = await prisma.club.findMany({
      where,
      include: {
        ...withCount,
        posts: { orderBy: { createdAt: 'desc' }, take: 2 },
      },
      orderBy: { id: 'asc' },
    });

    // 최근 3일 안에 올라온 글 수 = "새 글" 배지
    const since = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    const counts = await prisma.post.groupBy({
      by: ['clubId'],
      where: { clubId: { in: clubs.map((c) => c.id) }, createdAt: { gte: since } },
      _count: { _all: true },
    });
    const countMap = new Map(counts.map((c) => [c.clubId, c._count._all]));

    res.json(clubs.map((c) => s.boardSummary(c, countMap.get(c.id) ?? 0)));
  }),
);

// GET /api/clubs/:clubId — 동아리 상세 (ClubDetailScreen)
router.get(
  '/:clubId',
  optionalAuth,
  ah(async (req, res) => {
    const clubId = toId(req.params.clubId, 'clubId');
    const exists = await prisma.club.findUnique({ where: { id: clubId }, select: { id: true } });
    if (!exists) throw new HttpError(404, '동아리를 찾을 수 없습니다.');
    // 상세를 볼 때마다 조회수 +1
    const club = await prisma.club.update({
      where: { id: clubId },
      data: { viewCount: { increment: 1 } },
      include: { ...withCount, faqs: { orderBy: { id: 'asc' } } },
    });

    const recentNews = await prisma.newsPost.findMany({
      where: { clubId },
      orderBy: { createdAt: 'desc' },
      take: 9,
      select: { images: true },
    });
    const newsImages = recentNews.flatMap((n) => asArray(n.images)).slice(0, 9);

    let isJoined = false;
    let myRole = null;
    let hasApplied = false;
    if (req.user) {
      const m = await getMembership(req.user.id, clubId);
      isJoined = !!m;
      myRole = m?.role ?? null;
      hasApplied =
        (await prisma.application.count({
          where: { userId: req.user.id, clubId, status: { in: ['SUBMITTED', 'INTERVIEW'] } },
        })) > 0;
    }

    res.json(s.club(club, { newsImages, isJoined, myRole, hasApplied }));
  }),
);

// PATCH /api/clubs/:clubId — 동아리 정보 수정 (회장)
// { description, logoUrl, bannerUrl, meetingTime, location, isRecruiting, recruitDeadline, hasInterview, activities[] }
router.patch(
  '/:clubId',
  requireAuth,
  ah(async (req, res) => {
    const clubId = toId(req.params.clubId, 'clubId');
    await assertPresident(req.user.id, clubId);

    const data = {};
    for (const key of ['name', 'description', 'logoUrl', 'bannerUrl', 'meetingTime', 'location']) {
      if (req.body[key] !== undefined) data[key] = String(req.body[key]);
    }
    for (const key of ['isRecruiting', 'hasInterview']) {
      if (req.body[key] !== undefined) data[key] = !!req.body[key];
    }
    if (req.body.recruitDeadline !== undefined) {
      if (req.body.recruitDeadline === null) data.recruitDeadline = null;
      else {
        const d = new Date(req.body.recruitDeadline);
        if (Number.isNaN(d.getTime())) throw new HttpError(400, 'recruitDeadline 날짜 형식이 올바르지 않습니다.');
        data.recruitDeadline = d;
      }
    }
    if (req.body.activities !== undefined) data.activities = cleanStringArray(req.body.activities);

    // 모집 여부를 바꾸면 모집 공고(re) 테이블도 같이 맞춤
    if (data.isRecruiting !== undefined) {
      const open = await prisma.recruitment.findFirst({ where: { clubId, statusCode: 'OPEN' } });
      if (data.isRecruiting && !open) {
        await prisma.recruitment.create({
          data: { clubId, reDate: new Date(), deadlineDate: data.recruitDeadline ?? null },
        });
      } else if (!data.isRecruiting && open) {
        await prisma.recruitment.updateMany({ where: { clubId, statusCode: 'OPEN' }, data: { statusCode: 'CLOSED' } });
      } else if (open && data.recruitDeadline !== undefined) {
        await prisma.recruitment.update({ where: { id: open.id }, data: { deadlineDate: data.recruitDeadline } });
      }
    }

    const club = await prisma.club.update({
      where: { id: clubId },
      data,
      include: { ...withCount, faqs: true },
    });
    res.json(s.club(club));
  }),
);

// PUT /api/clubs/:clubId/faqs — 동아리 FAQ 전체 교체 (회장)  { faqs: [{ question, answer }] }
router.put(
  '/:clubId/faqs',
  requireAuth,
  ah(async (req, res) => {
    const clubId = toId(req.params.clubId, 'clubId');
    await assertPresident(req.user.id, clubId);
    const faqs = asArray(req.body.faqs)
      .filter((f) => f && String(f.question || '').trim() && String(f.answer || '').trim())
      .map((f) => ({ clubId, question: String(f.question).trim(), answer: String(f.answer).trim() }));

    await prisma.$transaction([
      prisma.clubFaq.deleteMany({ where: { clubId } }),
      prisma.clubFaq.createMany({ data: faqs }),
    ]);
    const saved = await prisma.clubFaq.findMany({ where: { clubId }, orderBy: { id: 'asc' } });
    res.json(saved.map((f) => ({ faq_id: f.id, question: f.question, answer: f.answer })));
  }),
);

// DELETE /api/clubs/:clubId/membership — 동아리 탈퇴  { reason }
router.delete(
  '/:clubId/membership',
  requireAuth,
  ah(async (req, res) => {
    const clubId = toId(req.params.clubId, 'clubId');
    await assertClubExists(clubId);
    const m = await getMembership(req.user.id, clubId);
    if (!m) throw new HttpError(404, '가입된 동아리가 아닙니다.');
    if (m.role === 'PRESIDENT') {
      const presidents = await prisma.membership.count({ where: { clubId, role: 'PRESIDENT' } });
      if (presidents <= 1) throw new HttpError(400, '회장은 다른 회원에게 회장을 넘긴 뒤 탈퇴할 수 있습니다.');
    }
    const reason = String(req.body?.reason || '').trim() || '사유 없음';

    await prisma.$transaction([
      prisma.membership.delete({ where: { id: m.id } }),
      prisma.withdrawal.create({ data: { userId: req.user.id, clubId, reason } }),
    ]);
    res.json({ ok: true });
  }),
);

// GET /api/clubs/:clubId/members — 회원 목록 (회장)
router.get(
  '/:clubId/members',
  requireAuth,
  ah(async (req, res) => {
    const clubId = toId(req.params.clubId, 'clubId');
    await assertPresident(req.user.id, clubId);
    const members = await prisma.membership.findMany({
      where: { clubId },
      include: { user: true },
      orderBy: [{ role: 'desc' }, { joinedAt: 'asc' }],
    });
    res.json(
      members.map((m) => ({
        userId: m.userId,
        stId: m.user.stId,
        name: m.user.name,
        department: m.user.department,
        role: m.role,
        joinedAt: m.joinedAt,
      })),
    );
  }),
);

// PATCH /api/clubs/:clubId/members/:userId — 역할 변경 (회장)  { role: "PRESIDENT" | "MEMBER" }
router.patch(
  '/:clubId/members/:userId',
  requireAuth,
  ah(async (req, res) => {
    const clubId = toId(req.params.clubId, 'clubId');
    const userId = toId(req.params.userId, 'userId');
    await assertPresident(req.user.id, clubId);
    const role = req.body.role === 'PRESIDENT' ? 'PRESIDENT' : 'MEMBER';

    const target = await getMembership(userId, clubId);
    if (!target) throw new HttpError(404, '해당 회원이 없습니다.');
    if (role === 'MEMBER' && target.role === 'PRESIDENT') {
      const presidents = await prisma.membership.count({ where: { clubId, role: 'PRESIDENT' } });
      if (presidents <= 1) throw new HttpError(400, '회장이 최소 1명은 있어야 합니다.');
    }
    const updated = await prisma.membership.update({ where: { id: target.id }, data: { role } });
    res.json({ userId, role: updated.role });
  }),
);

module.exports = router;
