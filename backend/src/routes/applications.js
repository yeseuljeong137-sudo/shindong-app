// 동아리 지원: 지원서 제출(ClubApplyScreen), 지원 현황(ApplicationStatusScreen), 회장의 합격 처리
const express = require('express');
const prisma = require('../lib/prisma');
const { ah, HttpError, toId, requireFields } = require('../lib/http');
const { asObject, cleanStringArray } = require('../lib/json');
const { formatDate } = require('../lib/time');
const { requireAuth, getMembership, assertClubExists, assertPresident } = require('../middleware/auth');
const { notify } = require('../lib/notify');
const s = require('../lib/serializers');

const router = express.Router();
// 이 라우터는 /api 에 붙기 때문에 router.use 대신 라우트마다 requireAuth 를 붙임

const IN_PROGRESS = ['SUBMITTED', 'INTERVIEW'];
const STATUSES = ['SUBMITTED', 'INTERVIEW', 'ACCEPTED', 'REJECTED'];

// POST /api/clubs/:clubId/applications — 지원서 제출
// { motive, interests: [], tools, experience, preparation }
router.post(
  '/clubs/:clubId/applications',
  requireAuth,
  ah(async (req, res) => {
    const clubId = toId(req.params.clubId, 'clubId');
    const club = await assertClubExists(clubId);
    requireFields(req.body, ['motive', 'tools', 'experience', 'preparation']);
    const interests = cleanStringArray(req.body.interests);
    if (!interests.length) throw new HttpError(400, '관심 분야를 하나 이상 선택해 주세요.');

    if (!club.isRecruiting) throw new HttpError(400, '지금은 모집 기간이 아닙니다.');
    if (club.recruitDeadline && club.recruitDeadline < new Date()) {
      throw new HttpError(400, '모집이 마감되었습니다.');
    }
    if (await getMembership(req.user.id, clubId)) throw new HttpError(409, '이미 가입한 동아리입니다.');
    const pending = await prisma.application.count({
      where: { userId: req.user.id, clubId, status: { in: IN_PROGRESS } },
    });
    if (pending) throw new HttpError(409, '이미 심사 중인 지원서가 있습니다.');

    // 지금 진행 중인 모집 공고(re)에 연결
    const openRe = await prisma.recruitment.findFirst({
      where: { clubId, statusCode: 'OPEN' },
      orderBy: { reDate: 'desc' },
    });

    const application = await prisma.application.create({
      data: {
        userId: req.user.id,
        clubId,
        recruitmentId: openRe?.id ?? null,
        answers: {
          motive: String(req.body.motive).trim(),
          interests,
          tools: String(req.body.tools).trim(),
          experience: String(req.body.experience).trim(),
          preparation: String(req.body.preparation).trim(),
        },
      },
      include: { club: true },
    });

    // 회장에게 새 지원서 알림
    const presidents = await prisma.membership.findMany({ where: { clubId, role: 'PRESIDENT' } });
    await notify(
      presidents.map((p) => p.userId),
      { type: '동아리 활동', title: `<${club.name}> 새 지원서가 도착했어요`, content: `${req.user.name}님이 지원서를 제출했어요.` },
    );

    res.status(201).json(s.applicationInProgress(application));
  }),
);

// GET /api/applications/me — 내 지원 현황 { inProgress: [...], history: [...] }
router.get(
  '/applications/me',
  requireAuth,
  ah(async (req, res) => {
    const apps = await prisma.application.findMany({
      where: { userId: req.user.id },
      include: { club: true },
      orderBy: { createdAt: 'desc' },
    });
    res.json({
      inProgress: apps.filter((a) => IN_PROGRESS.includes(a.status)).map(s.applicationInProgress),
      history: apps.filter((a) => !IN_PROGRESS.includes(a.status)).map(s.applicationHistory),
    });
  }),
);

// GET /api/applications/:id — 지원서 내용 보기 (본인 또는 해당 동아리 회장)
router.get(
  '/applications/:id',
  requireAuth,
  ah(async (req, res) => {
    const id = toId(req.params.id);
    const a = await prisma.application.findUnique({ where: { id }, include: { club: true, user: true } });
    if (!a) throw new HttpError(404, '지원서를 찾을 수 없습니다.');
    if (a.userId !== req.user.id) await assertPresident(req.user.id, a.clubId);

    res.json({
      applicationId: a.id,
      clubId: a.clubId,
      clubName: a.club.name,
      status: a.status,
      applicant: { stId: a.user.stId, name: a.user.name, department: a.user.department },
      answers: asObject(a.answers),
      noticeTitle: a.noticeTitle,
      noticeDetail: a.noticeDetail,
      appliedDate: formatDate(a.createdAt),
    });
  }),
);

// PATCH /api/applications/:id/cancel — 지원 취소 (본인, 심사 중일 때만)
router.patch(
  '/applications/:id/cancel',
  requireAuth,
  ah(async (req, res) => {
    const id = toId(req.params.id);
    const a = await prisma.application.findUnique({ where: { id } });
    if (!a || a.userId !== req.user.id) throw new HttpError(404, '지원서를 찾을 수 없습니다.');
    if (!IN_PROGRESS.includes(a.status)) throw new HttpError(400, '이미 결과가 나온 지원서는 취소할 수 없습니다.');
    const updated = await prisma.application.update({
      where: { id },
      data: { status: 'CANCELED' },
      include: { club: true },
    });
    res.json(s.applicationHistory(updated));
  }),
);

// GET /api/clubs/:clubId/applications?status=SUBMITTED — 지원자 목록 (회장)
router.get(
  '/clubs/:clubId/applications',
  requireAuth,
  ah(async (req, res) => {
    const clubId = toId(req.params.clubId, 'clubId');
    await assertPresident(req.user.id, clubId);
    const where = { clubId };
    if (req.query.status) where.status = String(req.query.status);
    const apps = await prisma.application.findMany({
      where,
      include: { user: true },
      orderBy: { createdAt: 'desc' },
    });
    res.json(
      apps.map((a) => ({
        applicationId: a.id,
        status: a.status,
        applicant: { stId: a.user.stId, name: a.user.name, department: a.user.department },
        answers: asObject(a.answers),
        noticeTitle: a.noticeTitle,
        noticeDetail: a.noticeDetail,
        appliedDate: formatDate(a.createdAt),
      })),
    );
  }),
);

// PATCH /api/applications/:id/status — 심사 결과 처리 (회장)
// { status: "INTERVIEW" | "ACCEPTED" | "REJECTED", noticeTitle?, noticeDetail? }
// ACCEPTED 가 되면 자동으로 동아리 회원이 됨
router.patch(
  '/applications/:id/status',
  requireAuth,
  ah(async (req, res) => {
    const id = toId(req.params.id);
    const a = await prisma.application.findUnique({ where: { id }, include: { club: true } });
    if (!a) throw new HttpError(404, '지원서를 찾을 수 없습니다.');
    await assertPresident(req.user.id, a.clubId);

    const status = String(req.body.status || '');
    if (!STATUSES.includes(status)) throw new HttpError(400, `status는 ${STATUSES.join(', ')} 중 하나여야 합니다.`);
    if (a.status === 'CANCELED') throw new HttpError(400, '지원자가 취소한 지원서입니다.');

    const data = { status };
    if (req.body.noticeTitle !== undefined) data.noticeTitle = req.body.noticeTitle || null;
    if (req.body.noticeDetail !== undefined) data.noticeDetail = req.body.noticeDetail || null;

    const ops = [prisma.application.update({ where: { id }, data, include: { club: true } })];
    if (status === 'ACCEPTED') {
      ops.push(
        prisma.membership.upsert({
          where: { userId_clubId: { userId: a.userId, clubId: a.clubId } },
          create: { userId: a.userId, clubId: a.clubId, role: 'MEMBER' },
          update: {},
        }),
      );
    }
    const [updated] = await prisma.$transaction(ops);

    const messages = {
      SUBMITTED: [`<${a.club.name}> 지원서가 다시 심사 중이에요`, '결과가 등록되면 바로 알려드릴게요.'],
      INTERVIEW: [`<${a.club.name}> 서류 합격`, `축하해요! ${updated.noticeDetail ? `면접 일정: ${updated.noticeDetail}` : '면접 일정과 준비 사항을 확인해 주세요.'}`],
      ACCEPTED: [`<${a.club.name}> 최종 합격`, '축하해요! 이제 동아리 회원이 되었어요.'],
      REJECTED: [`<${a.club.name}> 지원 결과 안내`, '아쉽지만 이번에는 함께하지 못하게 되었어요.'],
    };
    const [title, content] = messages[status];
    await notify(a.userId, { type: '지원 상태', title, content });

    res.json(IN_PROGRESS.includes(status) ? s.applicationInProgress(updated) : s.applicationHistory(updated));
  }),
);

module.exports = router;
