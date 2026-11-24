// 동아리 소식 피드 (ClubNewsScreen, ClubNewsWriteScreen, ClubNewsDraftsScreen)
// - 읽기: 누구나
// - 소식 작성 / 삭제 / 고정 / 임시저장: 회장
// - 좋아요 / 댓글: 로그인한 사용자
const express = require('express');
const prisma = require('../lib/prisma');
const { ah, HttpError, toId, requireFields } = require('../lib/http');
const { cleanStringArray } = require('../lib/json');
const { requireAuth, optionalAuth, getMembership, assertClubExists, assertPresident } = require('../middleware/auth');
const { notify } = require('../lib/notify');
const s = require('../lib/serializers');

// /api/clubs/:clubId/... 에 붙는 라우터
const router = express.Router({ mergeParams: true });
// /api/news 에 붙는 라우터 (전체 / 내 동아리 소식 모아보기)
const feedRouter = express.Router();

function newsInclude(me) {
  const myLike = me ? { where: { userId: me }, select: { userId: true } } : false;
  return {
    club: { select: { name: true, logoUrl: true } },
    _count: { select: { likes: true } },
    likes: myLike,
    comments: {
      orderBy: { createdAt: 'asc' },
      include: { author: { select: { name: true } }, _count: { select: { likes: true } }, likes: myLike },
    },
  };
}

const ORDER = [{ isPinned: 'desc' }, { createdAt: 'desc' }];

async function findNews(clubId, newsId) {
  const n = await prisma.newsPost.findFirst({ where: { id: newsId, clubId } });
  if (!n) throw new HttpError(404, '소식을 찾을 수 없습니다.');
  return n;
}

async function loadNews(newsId, me) {
  return s.news(await prisma.newsPost.findUnique({ where: { id: newsId }, include: newsInclude(me) }), me);
}

// GET /api/news?scope=all|mine — 전체 소식 피드
feedRouter.get(
  '/',
  optionalAuth,
  ah(async (req, res) => {
    const where = {};
    if (req.query.scope === 'mine') {
      if (!req.user) throw new HttpError(401, '로그인이 필요합니다.');
      where.club = { memberships: { some: { userId: req.user.id } } };
    }
    const list = await prisma.newsPost.findMany({
      where,
      include: newsInclude(req.user?.id),
      orderBy: { createdAt: 'desc' },
      take: Math.min(Number(req.query.limit) || 50, 100),
    });
    res.json(list.map((n) => s.news(n, req.user?.id)));
  }),
);

// GET /api/clubs/:clubId/news — 동아리 소식 목록 (고정글 먼저)
router.get(
  '/news',
  optionalAuth,
  ah(async (req, res) => {
    const clubId = toId(req.params.clubId, 'clubId');
    await assertClubExists(clubId);
    const list = await prisma.newsPost.findMany({ where: { clubId }, include: newsInclude(req.user?.id), orderBy: ORDER });
    res.json(list.map((n) => s.news(n, req.user?.id)));
  }),
);

// POST /api/clubs/:clubId/news — 소식 올리기 (회장)  { content, images: [] }
router.post(
  '/news',
  requireAuth,
  ah(async (req, res) => {
    const clubId = toId(req.params.clubId, 'clubId');
    await assertPresident(req.user.id, clubId);
    requireFields(req.body, ['content']);
    const images = cleanStringArray(req.body.images);

    const created = await prisma.newsPost.create({
      data: { clubId, authorId: req.user.id, content: String(req.body.content), images },
      include: { club: true },
    });

    // 회원들에게 새 피드 알림 (알림 설정에서 켠 사람만)
    const members = await prisma.membership.findMany({ where: { clubId, NOT: { userId: req.user.id } } });
    await notify(
      members.map((m) => m.userId),
      { type: '새 피드', title: `<${created.club.name}> 새 소식이 올라왔어요`, content: created.content.slice(0, 50) },
    );

    res.status(201).json(await loadNews(created.id, req.user.id));
  }),
);

// PATCH /api/clubs/:clubId/news/:newsId — 소식 수정 (회장)  { content?, images? }
router.patch(
  '/news/:newsId',
  requireAuth,
  ah(async (req, res) => {
    const clubId = toId(req.params.clubId, 'clubId');
    const newsId = toId(req.params.newsId, 'newsId');
    await assertPresident(req.user.id, clubId);
    await findNews(clubId, newsId);
    const data = {};
    if (req.body.content !== undefined) data.content = String(req.body.content);
    if (req.body.images !== undefined) data.images = cleanStringArray(req.body.images);
    await prisma.newsPost.update({ where: { id: newsId }, data });
    res.json(await loadNews(newsId, req.user.id));
  }),
);

// DELETE /api/clubs/:clubId/news/:newsId — 소식 삭제 (회장)
router.delete(
  '/news/:newsId',
  requireAuth,
  ah(async (req, res) => {
    const clubId = toId(req.params.clubId, 'clubId');
    const newsId = toId(req.params.newsId, 'newsId');
    await assertPresident(req.user.id, clubId);
    await findNews(clubId, newsId);
    await prisma.newsPost.delete({ where: { id: newsId } });
    res.json({ ok: true });
  }),
);

// POST /api/clubs/:clubId/news/:newsId/pin — 고정 토글 (회장, 동아리당 1개)
router.post(
  '/news/:newsId/pin',
  requireAuth,
  ah(async (req, res) => {
    const clubId = toId(req.params.clubId, 'clubId');
    const newsId = toId(req.params.newsId, 'newsId');
    await assertPresident(req.user.id, clubId);
    const n = await findNews(clubId, newsId);
    // 동아리당 고정 소식은 1개만 (앱 화면 동작과 같게)
    await prisma.$transaction([
      ...(n.isPinned ? [] : [prisma.newsPost.updateMany({ where: { clubId, isPinned: true }, data: { isPinned: false } })]),
      prisma.newsPost.update({ where: { id: newsId }, data: { isPinned: !n.isPinned } }),
    ]);
    res.json(await loadNews(newsId, req.user.id));
  }),
);

// POST /api/clubs/:clubId/news/:newsId/like — 좋아요 토글
router.post(
  '/news/:newsId/like',
  requireAuth,
  ah(async (req, res) => {
    const clubId = toId(req.params.clubId, 'clubId');
    const newsId = toId(req.params.newsId, 'newsId');
    await findNews(clubId, newsId);
    const key = { userId_newsId: { userId: req.user.id, newsId } };
    if (await prisma.newsLike.findUnique({ where: key })) await prisma.newsLike.delete({ where: key });
    else await prisma.newsLike.create({ data: { userId: req.user.id, newsId } });
    res.json(await loadNews(newsId, req.user.id));
  }),
);

// POST /api/clubs/:clubId/news/:newsId/comments — 댓글  { text }
router.post(
  '/news/:newsId/comments',
  requireAuth,
  ah(async (req, res) => {
    const clubId = toId(req.params.clubId, 'clubId');
    const newsId = toId(req.params.newsId, 'newsId');
    await findNews(clubId, newsId);
    const text = String(req.body.text ?? req.body.content ?? '').trim();
    if (!text) throw new HttpError(400, '댓글 내용을 입력해 주세요.');
    await prisma.newsComment.create({ data: { newsId, authorId: req.user.id, content: text } });
    res.status(201).json(await loadNews(newsId, req.user.id));
  }),
);

// DELETE /api/clubs/:clubId/news/:newsId/comments/:commentId — 댓글 삭제 (작성자 또는 회장)
router.delete(
  '/news/:newsId/comments/:commentId',
  requireAuth,
  ah(async (req, res) => {
    const clubId = toId(req.params.clubId, 'clubId');
    const newsId = toId(req.params.newsId, 'newsId');
    const commentId = toId(req.params.commentId, 'commentId');
    await findNews(clubId, newsId);
    const c = await prisma.newsComment.findFirst({ where: { id: commentId, newsId } });
    if (!c) throw new HttpError(404, '댓글을 찾을 수 없습니다.');
    const m = await getMembership(req.user.id, clubId);
    if (c.authorId !== req.user.id && m?.role !== 'PRESIDENT') {
      throw new HttpError(403, '작성자 또는 회장만 삭제할 수 있습니다.');
    }
    await prisma.newsComment.delete({ where: { id: commentId } });
    res.json(await loadNews(newsId, req.user.id));
  }),
);

// POST /api/clubs/:clubId/news/:newsId/comments/:commentId/like — 댓글 좋아요 토글
router.post(
  '/news/:newsId/comments/:commentId/like',
  requireAuth,
  ah(async (req, res) => {
    const clubId = toId(req.params.clubId, 'clubId');
    const newsId = toId(req.params.newsId, 'newsId');
    const commentId = toId(req.params.commentId, 'commentId');
    await findNews(clubId, newsId);
    const c = await prisma.newsComment.findFirst({ where: { id: commentId, newsId } });
    if (!c) throw new HttpError(404, '댓글을 찾을 수 없습니다.');
    const key = { userId_commentId: { userId: req.user.id, commentId } };
    if (await prisma.newsCommentLike.findUnique({ where: key })) await prisma.newsCommentLike.delete({ where: key });
    else await prisma.newsCommentLike.create({ data: { userId: req.user.id, commentId } });
    res.json(await loadNews(newsId, req.user.id));
  }),
);

// ───────── 소식 임시저장 (회장) ─────────

// GET /api/clubs/:clubId/news-drafts
router.get(
  '/news-drafts',
  requireAuth,
  ah(async (req, res) => {
    const clubId = toId(req.params.clubId, 'clubId');
    await assertPresident(req.user.id, clubId);
    const drafts = await prisma.newsDraft.findMany({
      where: { clubId, authorId: req.user.id },
      include: { club: { select: { name: true } } },
      orderBy: { savedAt: 'desc' },
    });
    res.json(drafts.map(s.newsDraft));
  }),
);

// POST /api/clubs/:clubId/news-drafts  { content, images[] }
router.post(
  '/news-drafts',
  requireAuth,
  ah(async (req, res) => {
    const clubId = toId(req.params.clubId, 'clubId');
    await assertPresident(req.user.id, clubId);
    const draft = await prisma.newsDraft.create({
      data: {
        clubId,
        authorId: req.user.id,
        content: String(req.body.content || ''),
        images: cleanStringArray(req.body.images),
      },
      include: { club: { select: { name: true } } },
    });
    res.status(201).json(s.newsDraft(draft));
  }),
);

// DELETE /api/clubs/:clubId/news-drafts  { draftIds: [1, 2] } — 여러 개 한 번에 삭제 (편집 모드)
router.delete(
  '/news-drafts',
  requireAuth,
  ah(async (req, res) => {
    const clubId = toId(req.params.clubId, 'clubId');
    const ids = (Array.isArray(req.body?.draftIds) ? req.body.draftIds : []).map(Number).filter(Number.isInteger);
    if (!ids.length) throw new HttpError(400, '삭제할 draftIds를 보내 주세요.');
    const { count } = await prisma.newsDraft.deleteMany({ where: { id: { in: ids }, clubId, authorId: req.user.id } });
    res.json({ ok: true, deleted: count });
  }),
);

// DELETE /api/clubs/:clubId/news-drafts/:draftId
router.delete(
  '/news-drafts/:draftId',
  requireAuth,
  ah(async (req, res) => {
    const clubId = toId(req.params.clubId, 'clubId');
    const draftId = toId(req.params.draftId, 'draftId');
    const { count } = await prisma.newsDraft.deleteMany({ where: { id: draftId, clubId, authorId: req.user.id } });
    if (!count) throw new HttpError(404, '임시저장 글을 찾을 수 없습니다.');
    res.json({ ok: true });
  }),
);

module.exports = { router, feedRouter };
