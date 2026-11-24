// 마이 페이지
const express = require('express');
const prisma = require('../lib/prisma');
const { ah, HttpError } = require('../lib/http');
const { requireAuth } = require('../middleware/auth');
const s = require('../lib/serializers');

const router = express.Router();
router.use(requireAuth);

// GET /api/users/me — 마이 페이지 상단 정보 + "나의 동아리 활동" 카드 숫자
router.get(
  '/me',
  ah(async (req, res) => {
    const me = req.user.id;
    const user = await prisma.user.findUnique({ where: { id: me } });
    if (!user) throw new HttpError(404, '사용자를 찾을 수 없습니다.');

    const [memberships, inProgress, history] = await Promise.all([
      prisma.membership.findMany({
        where: { userId: me },
        include: { club: true },
        orderBy: { joinedAt: 'asc' },
      }),
      prisma.application.count({ where: { userId: me, status: { in: ['SUBMITTED', 'INTERVIEW'] } } }),
      prisma.application.count({ where: { userId: me, status: { in: ['ACCEPTED', 'REJECTED', 'CANCELED'] } } }),
    ]);

    const names = memberships.map((m) => m.club.name);
    const clubSummary =
      names.length === 0 ? '가입된 동아리 없음' : names.length === 1 ? names[0] : `${names[0]} 외 ${names.length - 1}개`;

    res.json({
      ...s.user(user),
      status_label: '재학생',
      club_count: memberships.length,
      club_summary: clubSummary,
      is_president: memberships.some((m) => m.role === 'PRESIDENT'),
      application_in_progress_count: inProgress,
      application_history_count: history,
    });
  }),
);

// PATCH /api/users/me  { name?, department?, profileImg? }
router.patch(
  '/me',
  ah(async (req, res) => {
    const data = {};
    for (const key of ['name', 'department', 'profileImg']) {
      if (req.body[key] !== undefined) data[key] = req.body[key] === null ? null : String(req.body[key]).trim();
    }
    if (data.name === '' || data.name === null) throw new HttpError(400, '이름은 비울 수 없습니다.');
    const user = await prisma.user.update({ where: { id: req.user.id }, data });
    res.json(s.user(user));
  }),
);

module.exports = router;
