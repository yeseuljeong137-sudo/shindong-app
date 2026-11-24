// 홈 배너(HomeScreen, BannerDetailScreen) + 앱 FAQ(FaqScreen)
const express = require('express');
const prisma = require('../lib/prisma');
const { ah, HttpError, toId } = require('../lib/http');
const s = require('../lib/serializers');

const router = express.Router();

const bannerInclude = { club: { include: { _count: { select: { memberships: true } } } } };

// GET /api/banners — 홈 상단 배너 목록
router.get(
  '/banners',
  ah(async (req, res) => {
    const banners = await prisma.banner.findMany({ include: bannerInclude, orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] });
    res.json(banners.map(s.banner));
  }),
);

// GET /api/banners/:id — 배너 상세
router.get(
  '/banners/:id',
  ah(async (req, res) => {
    const b = await prisma.banner.findUnique({ where: { id: toId(req.params.id) }, include: bannerInclude });
    if (!b) throw new HttpError(404, '배너를 찾을 수 없습니다.');
    res.json(s.banner(b));
  }),
);

// GET /api/faqs — 앱 FAQ [{ question, answer }]
router.get(
  '/faqs',
  ah(async (req, res) => {
    const faqs = await prisma.appFaq.findMany({ orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] });
    res.json(faqs.map((f) => ({ faqId: f.id, question: f.question, answer: f.answer })));
  }),
);

module.exports = router;
