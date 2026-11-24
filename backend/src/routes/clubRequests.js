// 동아리 개설 요청 (ClubCreateRequestScreen → SubmissionCompleteScreen) + 관리자 승인
const express = require('express');
const prisma = require('../lib/prisma');
const { ah, HttpError, toId, requireFields } = require('../lib/http');
const { formatDate } = require('../lib/time');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { notify } = require('../lib/notify');

const router = express.Router();
router.use(requireAuth); // /api/club-requests 에만 붙음

const STATUS_TEXT = { PENDING: '검토 중', APPROVED: '승인', REJECTED: '반려' };

function serialize(r) {
  return {
    requestId: r.id,
    name: r.name,
    category: r.category,
    purpose: r.purpose,
    advisor: r.advisor,
    leaderInfo: r.leaderInfo,
    status: r.status,
    statusText: STATUS_TEXT[r.status] ?? r.status,
    requestedAt: formatDate(r.createdAt),
    ...(r.requester && { requester: { stId: r.requester.stId, name: r.requester.name } }),
  };
}

// POST /api/club-requests — 개설 요청 보내기
// { name, category, etcCategory?, purpose, advisor, leaderInfo }  (category가 "기타"면 etcCategory 사용)
router.post(
  '/',
  ah(async (req, res) => {
    requireFields(req.body, ['name', 'category', 'purpose', 'advisor', 'leaderInfo']);
    let category = String(req.body.category).trim();
    if (category === '기타') {
      requireFields(req.body, ['etcCategory']);
      category = String(req.body.etcCategory).trim();
    }
    const created = await prisma.clubCreateRequest.create({
      data: {
        requesterId: req.user.id,
        name: String(req.body.name).trim(),
        category,
        purpose: String(req.body.purpose).trim(),
        advisor: String(req.body.advisor).trim(),
        leaderInfo: String(req.body.leaderInfo).trim(),
      },
    });

    const admins = await prisma.user.findMany({ where: { isAdmin: true }, select: { id: true } });
    await notify(admins.map((a) => a.id), {
      type: '동아리 활동',
      title: '새 동아리 개설 요청',
      content: `${req.user.name}님이 "${created.name}" 개설을 요청했어요.`,
    });

    res.status(201).json(serialize(created));
  }),
);

// GET /api/club-requests/me — 내가 보낸 요청
router.get(
  '/me',
  ah(async (req, res) => {
    const list = await prisma.clubCreateRequest.findMany({ where: { requesterId: req.user.id }, orderBy: { createdAt: 'desc' } });
    res.json(list.map(serialize));
  }),
);

// GET /api/club-requests?status=PENDING — 전체 요청 (관리자)
router.get(
  '/',
  requireAdmin,
  ah(async (req, res) => {
    const where = req.query.status ? { status: String(req.query.status) } : {};
    const list = await prisma.clubCreateRequest.findMany({ where, include: { requester: true }, orderBy: { createdAt: 'desc' } });
    res.json(list.map(serialize));
  }),
);

// PATCH /api/club-requests/:id — 승인/반려 (관리자)  { status: "APPROVED" | "REJECTED" }
// 승인하면 동아리가 만들어지고 요청자가 회장이 됨
router.patch(
  '/:id',
  requireAdmin,
  ah(async (req, res) => {
    const id = toId(req.params.id);
    const status = req.body.status;
    if (!['APPROVED', 'REJECTED'].includes(status)) throw new HttpError(400, 'status는 APPROVED 또는 REJECTED 입니다.');
    const r = await prisma.clubCreateRequest.findUnique({ where: { id } });
    if (!r) throw new HttpError(404, '요청을 찾을 수 없습니다.');
    if (r.status !== 'PENDING') throw new HttpError(400, '이미 처리된 요청입니다.');

    let clubId = null;
    await prisma.$transaction(async (tx) => {
      await tx.clubCreateRequest.update({ where: { id }, data: { status } });
      if (status === 'APPROVED') {
        const club = await tx.club.create({
          data: {
            name: r.name,
            category: r.category,
            description: r.purpose,
            memberships: { create: { userId: r.requesterId, role: 'PRESIDENT' } },
          },
        });
        clubId = club.id;
      }
    });

    await notify(r.requesterId, {
      type: '동아리 활동',
      title: status === 'APPROVED' ? `"${r.name}" 개설이 승인되었어요` : `"${r.name}" 개설 요청 결과 안내`,
      content: status === 'APPROVED' ? '이제 회장으로 동아리를 운영할 수 있어요.' : '아쉽지만 요청이 반려되었어요.',
    });

    res.json({ ok: true, status, clubId });
  }),
);

module.exports = router;
