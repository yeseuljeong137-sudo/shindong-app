// 운영진 기능: 모집 공고(re), 회비(dues), 장부(account_books)
// /api/clubs/:clubId/... 아래에 붙음 (목록표 28, 30, 31번)
const express = require('express');
const prisma = require('../lib/prisma');
const { ah, HttpError, toId, requireFields } = require('../lib/http');
const { formatDate, formatDateTime, formatIsoDate } = require('../lib/time');
const { requireAuth, assertMember, assertPresident } = require('../middleware/auth');

const router = express.Router({ mergeParams: true });

function parseDate(value, name) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw new HttpError(400, `${name} 날짜 형식이 올바르지 않습니다.`);
  return d;
}

// ───────── 모집 공고 (re) ─────────

const serializeRe = (r) => ({
  re_id: r.id,
  club_id: r.clubId,
  re_date: formatIsoDate(r.reDate),
  deadline_date: formatIsoDate(r.deadlineDate),
  status_code: r.statusCode,
  application_count: r._count?.applications ?? undefined,
});

// GET /api/clubs/:clubId/recruitments — 모집 공고 목록 (누구나)
router.get(
  '/recruitments',
  ah(async (req, res) => {
    const clubId = toId(req.params.clubId, 'clubId');
    const list = await prisma.recruitment.findMany({
      where: { clubId },
      include: { _count: { select: { applications: true } } },
      orderBy: { reDate: 'desc' },
    });
    res.json(list.map(serializeRe));
  }),
);

// POST /api/clubs/:clubId/recruitments — 모집 공고 등록 (회장)  { reDate, deadlineDate? }
// 등록하면 이전 모집은 마감 처리되고, 동아리가 "모집중"으로 바뀜
router.post(
  '/recruitments',
  requireAuth,
  ah(async (req, res) => {
    const clubId = toId(req.params.clubId, 'clubId');
    await assertPresident(req.user.id, clubId);
    const reDate = req.body.reDate ? parseDate(req.body.reDate, 'reDate') : new Date();
    const deadlineDate = req.body.deadlineDate ? parseDate(req.body.deadlineDate, 'deadlineDate') : null;
    if (deadlineDate && deadlineDate < reDate) throw new HttpError(400, '마감일은 모집 시작일 이후여야 합니다.');

    const [, created] = await prisma.$transaction([
      prisma.recruitment.updateMany({ where: { clubId, statusCode: 'OPEN' }, data: { statusCode: 'CLOSED' } }),
      prisma.recruitment.create({ data: { clubId, reDate, deadlineDate } }),
      prisma.club.update({ where: { id: clubId }, data: { isRecruiting: true, recruitDeadline: deadlineDate } }),
    ]);
    res.status(201).json(serializeRe(created));
  }),
);

// PATCH /api/clubs/:clubId/recruitments/:reId/close — 모집 마감 (회장)
router.patch(
  '/recruitments/:reId/close',
  requireAuth,
  ah(async (req, res) => {
    const clubId = toId(req.params.clubId, 'clubId');
    const reId = toId(req.params.reId, 'reId');
    await assertPresident(req.user.id, clubId);
    const r = await prisma.recruitment.findFirst({ where: { id: reId, clubId } });
    if (!r) throw new HttpError(404, '모집 공고를 찾을 수 없습니다.');
    const [updated] = await prisma.$transaction([
      prisma.recruitment.update({ where: { id: reId }, data: { statusCode: 'CLOSED' } }),
      prisma.club.update({ where: { id: clubId }, data: { isRecruiting: false } }),
    ]);
    res.json(serializeRe(updated));
  }),
);

// ───────── 회비 (dues) ─────────

// GET /api/clubs/:clubId/dues — 회비 납부 내역 (회원이면 볼 수 있음, 공개)
router.get(
  '/dues',
  requireAuth,
  ah(async (req, res) => {
    const clubId = toId(req.params.clubId, 'clubId');
    await assertMember(req.user.id, clubId);
    const list = await prisma.due.findMany({
      where: { clubId },
      include: { user: { select: { stId: true, name: true } } },
      orderBy: { paidAt: 'desc' },
    });
    res.json({
      total: list.reduce((sum, d) => sum + d.amount, 0),
      dues: list.map((d) => ({
        due_id: d.id,
        st_id: d.user.stId,
        name: d.user.name,
        amount: d.amount,
        paid_at: formatDateTime(d.paidAt),
      })),
    });
  }),
);

// POST /api/clubs/:clubId/dues — 납부 기록 (회장)  { stId, amount, paidAt? }
router.post(
  '/dues',
  requireAuth,
  ah(async (req, res) => {
    const clubId = toId(req.params.clubId, 'clubId');
    await assertPresident(req.user.id, clubId);
    requireFields(req.body, ['stId', 'amount']);
    const amount = Number(req.body.amount);
    if (!Number.isInteger(amount) || amount <= 0) throw new HttpError(400, '금액은 1원 이상의 정수여야 합니다.');
    const user = await prisma.user.findUnique({ where: { stId: String(req.body.stId) } });
    if (!user) throw new HttpError(404, '해당 학번의 회원이 없습니다.');
    await assertMember(user.id, clubId);

    const d = await prisma.due.create({
      data: { clubId, userId: user.id, amount, paidAt: req.body.paidAt ? parseDate(req.body.paidAt, 'paidAt') : undefined },
    });
    res.status(201).json({ due_id: d.id, st_id: user.stId, name: user.name, amount: d.amount, paid_at: formatDateTime(d.paidAt) });
  }),
);

// DELETE /api/clubs/:clubId/dues/:dueId — 잘못 적은 기록 삭제 (회장)
router.delete(
  '/dues/:dueId',
  requireAuth,
  ah(async (req, res) => {
    const clubId = toId(req.params.clubId, 'clubId');
    await assertPresident(req.user.id, clubId);
    const { count } = await prisma.due.deleteMany({ where: { id: toId(req.params.dueId, 'dueId'), clubId } });
    if (!count) throw new HttpError(404, '기록을 찾을 수 없습니다.');
    res.json({ ok: true });
  }),
);

// ───────── 장부 (account_books) ─────────

// GET /api/clubs/:clubId/account-books — 수입·지출 내역 + 잔액 (회원 공개)
router.get(
  '/account-books',
  requireAuth,
  ah(async (req, res) => {
    const clubId = toId(req.params.clubId, 'clubId');
    await assertMember(req.user.id, clubId);
    const list = await prisma.accountBook.findMany({ where: { clubId }, orderBy: { createdAt: 'desc' } });
    const income = list.filter((a) => a.amount > 0).reduce((s, a) => s + a.amount, 0);
    const expense = list.filter((a) => a.amount < 0).reduce((s, a) => s - a.amount, 0);
    res.json({
      income,
      expense,
      balance: income - expense,
      entries: list.map((a) => ({
        entry_id: a.id,
        created_at: formatDate(a.createdAt),
        amount: a.amount,
        type: a.amount >= 0 ? '수입' : '지출',
        description: a.description,
        proof_img: a.proofImg,
      })),
    });
  }),
);

// POST /api/clubs/:clubId/account-books — 장부 기록 (회장)
// { amount (수입은 +, 지출은 -), description?, proofImg?, createdAt? }
router.post(
  '/account-books',
  requireAuth,
  ah(async (req, res) => {
    const clubId = toId(req.params.clubId, 'clubId');
    await assertPresident(req.user.id, clubId);
    const amount = Number(req.body.amount);
    if (!Number.isInteger(amount) || amount === 0) throw new HttpError(400, '금액은 0이 아닌 정수여야 합니다. (지출은 음수)');
    const a = await prisma.accountBook.create({
      data: {
        clubId,
        amount,
        description: req.body.description ? String(req.body.description) : null,
        proofImg: req.body.proofImg ? String(req.body.proofImg) : null,
        createdAt: req.body.createdAt ? parseDate(req.body.createdAt, 'createdAt') : undefined,
      },
    });
    res.status(201).json({
      entry_id: a.id,
      created_at: formatDate(a.createdAt),
      amount: a.amount,
      type: a.amount >= 0 ? '수입' : '지출',
      description: a.description,
      proof_img: a.proofImg,
    });
  }),
);

// DELETE /api/clubs/:clubId/account-books/:entryId (회장)
router.delete(
  '/account-books/:entryId',
  requireAuth,
  ah(async (req, res) => {
    const clubId = toId(req.params.clubId, 'clubId');
    await assertPresident(req.user.id, clubId);
    const { count } = await prisma.accountBook.deleteMany({ where: { id: toId(req.params.entryId, 'entryId'), clubId } });
    if (!count) throw new HttpError(404, '기록을 찾을 수 없습니다.');
    res.json({ ok: true });
  }),
);

module.exports = router;
