// 동아리 게시판 (ClubBoardScreen, ClubPostDetailScreen, ClubPostWriteScreen)
// /api/clubs/:clubId/... 아래에 붙음
// - 읽기: 누구나 (로그인하면 좋아요 여부까지 표시)
// - 글/댓글 쓰기: 로그인한 사용자 (자유게시판에 비회원 지원 문의 글이 있어서)
// - 공지사항 작성 / 상단 고정: 회장만
const express = require('express');
const prisma = require('../lib/prisma');
const { ah, HttpError, toId, requireFields } = require('../lib/http');
const { asArray, cleanStringArray } = require('../lib/json');
const { requireAuth, optionalAuth, getMembership, assertClubExists } = require('../middleware/auth');
const { notify } = require('../lib/notify');
const s = require('../lib/serializers');

const router = express.Router({ mergeParams: true });

const CATEGORIES = ['공지사항', '자유게시판', '질문게시판', '정보공유'];

function postInclude(me) {
  // 로그인한 경우 내 좋아요만 가져와서 isLiked 계산
  const myLike = me ? { where: { userId: me }, select: { userId: true } } : false;
  return {
    author: { select: { name: true } },
    _count: { select: { likes: true, comments: true } },
    likes: myLike,
    comments: {
      orderBy: { createdAt: 'asc' },
      include: {
        author: { select: { name: true } },
        _count: { select: { likes: true } },
        likes: myLike,
      },
    },
  };
}

// 첨부파일 목록 정리 (업로드 API가 돌려준 값 그대로 받으면 됨)
function cleanAttachments(value) {
  return asArray(value)
    .filter((a) => a && a.fileUrl)
    .map((a) => ({
      fileName: String(a.fileName || 'file'),
      fileUrl: String(a.fileUrl),
      fileSizeBytes: Number(a.fileSizeBytes) || 0,
      mimeType: String(a.mimeType || 'application/octet-stream'),
      type: a.type === 'image' ? 'image' : 'file',
    }));
}

async function isPresident(userId, clubId) {
  const m = await getMembership(userId, clubId);
  return m?.role === 'PRESIDENT';
}

async function findPost(clubId, postId) {
  const p = await prisma.post.findFirst({ where: { id: postId, clubId } });
  if (!p) throw new HttpError(404, '게시글을 찾을 수 없습니다.');
  return p;
}

async function loadPost(postId, me) {
  return prisma.post.findUnique({ where: { id: postId }, include: postInclude(me) });
}

// GET /api/clubs/:clubId/posts?category=자유게시판  — 게시글 목록 (고정글 → 최신순)
router.get(
  '/posts',
  optionalAuth,
  ah(async (req, res) => {
    const clubId = toId(req.params.clubId, 'clubId');
    await assertClubExists(clubId);
    const where = { clubId };
    if (req.query.category && req.query.category !== '전체') where.boardCategory = String(req.query.category);
    if (req.query.q) {
      const q = String(req.query.q);
      where.OR = [{ title: { contains: q } }, { content: { contains: q } }];
    }
    const posts = await prisma.post.findMany({
      where,
      include: postInclude(req.user?.id),
      orderBy: [{ isPinned: 'desc' }, { createdAt: 'desc' }],
    });
    res.json(posts.map((p) => s.post(p, req.user?.id)));
  }),
);

// GET /api/clubs/:clubId/posts/:postId — 게시글 상세 (조회수 +1)
router.get(
  '/posts/:postId',
  optionalAuth,
  ah(async (req, res) => {
    const clubId = toId(req.params.clubId, 'clubId');
    const postId = toId(req.params.postId, 'postId');
    await findPost(clubId, postId);
    await prisma.post.update({ where: { id: postId }, data: { viewCount: { increment: 1 } } });
    res.json(s.post(await loadPost(postId, req.user?.id), req.user?.id));
  }),
);

// POST /api/clubs/:clubId/posts — 글 작성 (CreatePostRequestDto)
// { boardCategory, title, content, tags[], attachments[], isPinned, isAnonymous }
router.post(
  '/posts',
  requireAuth,
  ah(async (req, res) => {
    const clubId = toId(req.params.clubId, 'clubId');
    const club = await assertClubExists(clubId);
    requireFields(req.body, ['title', 'content']);

    const boardCategory = CATEGORIES.includes(req.body.boardCategory) ? req.body.boardCategory : '자유게시판';
    const isPinned = !!req.body.isPinned;
    const isNotice = boardCategory === '공지사항' || isPinned;
    const president = await isPresident(req.user.id, clubId);
    if (isNotice && !president) throw new HttpError(403, '공지사항 작성과 상단 고정은 회장만 할 수 있습니다.');

    const created = await prisma.$transaction(async (tx) => {
      if (isPinned) await tx.post.updateMany({ where: { clubId, isPinned: true }, data: { isPinned: false } });
      return tx.post.create({
        data: {
          clubId,
          authorId: req.user.id,
          boardCategory,
          title: String(req.body.title).trim(),
          content: String(req.body.content),
          tags: cleanStringArray(req.body.tags),
          attachments: cleanAttachments(req.body.attachments),
          isPinned,
          isNotice,
          isAnonymous: !isNotice && !!req.body.isAnonymous,
          viewCount: 1,
        },
      });
    });

    // 공지사항이면 회원들에게 알림
    if (isNotice) {
      const members = await prisma.membership.findMany({ where: { clubId, NOT: { userId: req.user.id } } });
      await notify(
        members.map((m) => m.userId),
        { type: '동아리 활동', title: `<${club.name}> 새 공지사항`, content: created.title },
      );
    }

    res.status(201).json(s.post(await loadPost(created.id, req.user.id), req.user.id));
  }),
);

// PATCH /api/clubs/:clubId/posts/:postId — 글 수정 (작성자)
router.patch(
  '/posts/:postId',
  requireAuth,
  ah(async (req, res) => {
    const clubId = toId(req.params.clubId, 'clubId');
    const postId = toId(req.params.postId, 'postId');
    const p = await findPost(clubId, postId);
    if (p.authorId !== req.user.id) throw new HttpError(403, '작성자만 수정할 수 있습니다.');

    const data = {};
    if (req.body.title !== undefined) data.title = String(req.body.title).trim();
    if (req.body.content !== undefined) data.content = String(req.body.content);
    if (req.body.tags !== undefined) data.tags = cleanStringArray(req.body.tags);
    if (req.body.attachments !== undefined) data.attachments = cleanAttachments(req.body.attachments);
    if (req.body.boardCategory !== undefined && CATEGORIES.includes(req.body.boardCategory)) {
      if (req.body.boardCategory === '공지사항' && !(await isPresident(req.user.id, clubId))) {
        throw new HttpError(403, '공지사항은 회장만 작성할 수 있습니다.');
      }
      data.boardCategory = req.body.boardCategory;
      data.isNotice = req.body.boardCategory === '공지사항' || p.isPinned;
    }
    if (data.title === '') throw new HttpError(400, '제목을 입력해 주세요.');

    await prisma.post.update({ where: { id: postId }, data });
    res.json(s.post(await loadPost(postId, req.user.id), req.user.id));
  }),
);

// DELETE /api/clubs/:clubId/posts/:postId — 글 삭제 (작성자 또는 회장)
router.delete(
  '/posts/:postId',
  requireAuth,
  ah(async (req, res) => {
    const clubId = toId(req.params.clubId, 'clubId');
    const postId = toId(req.params.postId, 'postId');
    const p = await findPost(clubId, postId);
    if (p.authorId !== req.user.id && !(await isPresident(req.user.id, clubId))) {
      throw new HttpError(403, '작성자 또는 회장만 삭제할 수 있습니다.');
    }
    await prisma.post.delete({ where: { id: postId } });
    res.json({ ok: true });
  }),
);

// POST /api/clubs/:clubId/posts/:postId/like — 좋아요 토글
router.post(
  '/posts/:postId/like',
  requireAuth,
  ah(async (req, res) => {
    const clubId = toId(req.params.clubId, 'clubId');
    const postId = toId(req.params.postId, 'postId');
    await findPost(clubId, postId);
    const key = { userId_postId: { userId: req.user.id, postId } };
    const existing = await prisma.postLike.findUnique({ where: key });
    if (existing) await prisma.postLike.delete({ where: key });
    else await prisma.postLike.create({ data: { userId: req.user.id, postId } });
    res.json(s.post(await loadPost(postId, req.user.id), req.user.id));
  }),
);

// POST /api/clubs/:clubId/posts/:postId/pin — 상단 고정 토글 (회장, 동아리당 1개만 고정)
router.post(
  '/posts/:postId/pin',
  requireAuth,
  ah(async (req, res) => {
    const clubId = toId(req.params.clubId, 'clubId');
    const postId = toId(req.params.postId, 'postId');
    const p = await findPost(clubId, postId);
    if (!(await isPresident(req.user.id, clubId))) throw new HttpError(403, '회장만 고정할 수 있습니다.');

    const nextPinned = !p.isPinned;
    await prisma.$transaction(async (tx) => {
      if (nextPinned) await tx.post.updateMany({ where: { clubId, isPinned: true }, data: { isPinned: false } });
      await tx.post.update({
        where: { id: postId },
        data: { isPinned: nextPinned, isNotice: nextPinned ? true : p.boardCategory === '공지사항' },
      });
    });
    res.json(s.post(await loadPost(postId, req.user.id), req.user.id));
  }),
);

// POST /api/clubs/:clubId/posts/:postId/comments — 댓글 작성  { content, isAnonymous }
router.post(
  '/posts/:postId/comments',
  requireAuth,
  ah(async (req, res) => {
    const clubId = toId(req.params.clubId, 'clubId');
    const postId = toId(req.params.postId, 'postId');
    const p = await findPost(clubId, postId);
    requireFields(req.body, ['content']);

    await prisma.comment.create({
      data: {
        postId,
        authorId: req.user.id,
        content: String(req.body.content).trim(),
        isAnonymous: !!req.body.isAnonymous,
      },
    });

    if (p.authorId !== req.user.id) {
      await notify(p.authorId, {
        type: '동아리 활동',
        title: '내 글에 새 댓글이 달렸어요',
        content: `"${p.title}"`,
      });
    }
    res.status(201).json(s.post(await loadPost(postId, req.user.id), req.user.id));
  }),
);

// DELETE /api/clubs/:clubId/posts/:postId/comments/:commentId — 댓글 삭제 (작성자 또는 회장)
router.delete(
  '/posts/:postId/comments/:commentId',
  requireAuth,
  ah(async (req, res) => {
    const clubId = toId(req.params.clubId, 'clubId');
    const postId = toId(req.params.postId, 'postId');
    const commentId = toId(req.params.commentId, 'commentId');
    await findPost(clubId, postId);
    const c = await prisma.comment.findFirst({ where: { id: commentId, postId } });
    if (!c) throw new HttpError(404, '댓글을 찾을 수 없습니다.');
    if (c.authorId !== req.user.id && !(await isPresident(req.user.id, clubId))) {
      throw new HttpError(403, '작성자 또는 회장만 삭제할 수 있습니다.');
    }
    await prisma.comment.delete({ where: { id: commentId } });
    res.json(s.post(await loadPost(postId, req.user.id), req.user.id));
  }),
);

// POST /api/clubs/:clubId/posts/:postId/comments/:commentId/like — 댓글 좋아요 토글
router.post(
  '/posts/:postId/comments/:commentId/like',
  requireAuth,
  ah(async (req, res) => {
    const clubId = toId(req.params.clubId, 'clubId');
    const postId = toId(req.params.postId, 'postId');
    const commentId = toId(req.params.commentId, 'commentId');
    await findPost(clubId, postId);
    const c = await prisma.comment.findFirst({ where: { id: commentId, postId } });
    if (!c) throw new HttpError(404, '댓글을 찾을 수 없습니다.');

    const key = { userId_commentId: { userId: req.user.id, commentId } };
    const existing = await prisma.commentLike.findUnique({ where: key });
    if (existing) await prisma.commentLike.delete({ where: key });
    else await prisma.commentLike.create({ data: { userId: req.user.id, commentId } });
    res.json(s.post(await loadPost(postId, req.user.id), req.user.id));
  }),
);

// ───────── 게시글 임시저장 (내 것만 보임) ─────────

// GET /api/clubs/:clubId/post-drafts
router.get(
  '/post-drafts',
  requireAuth,
  ah(async (req, res) => {
    const clubId = toId(req.params.clubId, 'clubId');
    const drafts = await prisma.postDraft.findMany({
      where: { clubId, authorId: req.user.id },
      orderBy: { savedAt: 'desc' },
    });
    res.json(drafts.map(s.postDraft));
  }),
);

// POST /api/clubs/:clubId/post-drafts  { boardCategory, title, content, tags[], attachments[], isPinned }
router.post(
  '/post-drafts',
  requireAuth,
  ah(async (req, res) => {
    const clubId = toId(req.params.clubId, 'clubId');
    await assertClubExists(clubId);
    const draft = await prisma.postDraft.create({
      data: {
        clubId,
        authorId: req.user.id,
        boardCategory: CATEGORIES.includes(req.body.boardCategory) ? req.body.boardCategory : null,
        title: String(req.body.title || '').trim() || '(제목 없음)',
        content: String(req.body.content || ''),
        tags: cleanStringArray(req.body.tags),
        attachments: cleanAttachments(req.body.attachments),
        isPinned: !!req.body.isPinned,
      },
    });
    res.status(201).json(s.postDraft(draft));
  }),
);

// DELETE /api/clubs/:clubId/post-drafts/:draftId
router.delete(
  '/post-drafts/:draftId',
  requireAuth,
  ah(async (req, res) => {
    const clubId = toId(req.params.clubId, 'clubId');
    const draftId = toId(req.params.draftId, 'draftId');
    const { count } = await prisma.postDraft.deleteMany({ where: { id: draftId, clubId, authorId: req.user.id } });
    if (!count) throw new HttpError(404, '임시저장 글을 찾을 수 없습니다.');
    res.json({ ok: true });
  }),
);

module.exports = router;
