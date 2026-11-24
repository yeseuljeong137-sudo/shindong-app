// AI 맞춤 동아리 추천 설문 (SurveyScreen)
// 진짜 AI 대신, 설문 답변과 동아리 정보(분야·소개·활동·모임 시간)를 비교해 점수를 매기는 규칙 기반 추천
const express = require('express');
const prisma = require('../lib/prisma');
const { ah, HttpError } = require('../lib/http');
const { asArray, asObject, cleanStringArray } = require('../lib/json');
const { requireAuth } = require('../middleware/auth');
const s = require('../lib/serializers');

const router = express.Router();
router.use(requireAuth); // /api/survey 에만 붙음

// Q1 관심 분야 → 동아리 분야 / 키워드
const Q1 = {
  '학술': { category: '학술', keywords: ['학술', '스터디', '연구'] },
  '체육': { category: '체육/스포츠', keywords: ['운동', '스포츠', '농구', '러닝', '등산'] },
  '문화 / 예술': { category: '문화/예술', keywords: ['공연', '전시', '사진', '댄스', '문화'] },
  '사회 / 봉사': { category: '사회/봉사', keywords: ['봉사', '나눔', '지역'] },
  'IT / 코딩': { keywords: ['프로그래밍', '개발', '코딩', '해커톤', '웹', '앱', 'e스포츠'] },
  '음악': { keywords: ['음악', '악기', '밴드', '합주', '버스킹'] },
};

// Q2 하고 싶은 활동 → 키워드
const Q2 = {
  '친구 사귀기': ['친목', '교류', '네트워킹', '함께'],
  '취미 즐기기': ['취미', '즐기', '관람', '산행', '러닝'],
  '함께 배우기': ['기초', '스터디', '학습', '배우', '강의'],
  '프로젝트·대회': ['프로젝트', '대회', '공모전', '해커톤', '경진'],
  '공연·작품 만들기': ['공연', '무대', '전시', '사진전', '작품', '안무'],
  '봉사·나눔': ['봉사', '나눔', '1365'],
};

const WEEKDAYS = ['월', '화', '수', '목', '금'];
const WEEKEND = ['토', '일'];

function parseMeeting(text = '') {
  const hourMatch = text.match(/(\d{1,2}):\d{2}/);
  return {
    hour: hourMatch ? Number(hourMatch[1]) : null,
    weekday: WEEKDAYS.some((d) => text.includes(d)),
    weekend: WEEKEND.some((d) => text.includes(d)),
    biweekly: text.includes('격주'),
    multiPerWeek: /[월화수목금토일]\s*[·,/]\s*[월화수목금토일]/.test(text),
  };
}

function scoreClub(club, a) {
  const text = [club.name, club.description, ...asArray(club.activities)].join(' ');
  let score = 0;
  const reasons = [];

  // Q1 분야 (가장 중요)
  for (const choice of a.q1) {
    const rule = Q1[choice];
    if (!rule) continue;
    if (rule.category && club.category === rule.category) {
      score += 5;
      reasons.push(`관심 분야 '${choice}'`);
    } else if (rule.keywords.some((k) => text.includes(k))) {
      score += 4;
      reasons.push(`관심 분야 '${choice}'`);
    }
  }
  // Q2 활동
  for (const choice of a.q2) {
    if ((Q2[choice] || []).some((k) => text.includes(k))) {
      score += 2;
      reasons.push(`'${choice}' 활동`);
    }
  }
  // Q3 경험: 처음이면 기초부터 알려주는 동아리 가산점
  if (a.q3?.startsWith('처음') && /(기초|초보|처음|입문)/.test(text + club.faqs.map((f) => f.answer).join(' '))) {
    score += 2;
    reasons.push('초보자 환영');
  }
  // Q4 시간대
  const m = parseMeeting(club.meetingTime);
  if (a.q4.includes('평일 저녁') && m.weekday && m.hour !== null && m.hour >= 17) score += 2;
  if (a.q4.includes('평일 낮') && m.weekday && m.hour !== null && m.hour < 17) score += 2;
  if (a.q4.includes('주말') && m.weekend) score += 2;
  // Q5 빈도
  if (a.q5 === '월 1~2회' && m.biweekly) score += 1;
  if (a.q5 === '주 1회' && !m.biweekly && !m.multiPerWeek) score += 1;
  if (a.q5 === '주 2회 이상' && m.multiPerWeek) score += 1;
  if (a.q5 === '유동적으로') score += 0.5;

  if (club.isRecruiting) score += 1;
  return { score, reasons: [...new Set(reasons)] };
}

async function recommend(answers, limit = 3) {
  const clubs = await prisma.club.findMany({ include: { faqs: true, _count: { select: { memberships: true } } } });
  return clubs
    .map((c) => ({ club: c, ...scoreClub(c, answers) }))
    .filter((r) => r.score > 0)
    .sort((x, y) => y.score - x.score)
    .slice(0, limit)
    .map((r) => ({ ...s.club(r.club), match_score: r.score, match_reasons: r.reasons }));
}

function cleanAnswers(body) {
  return {
    q1: cleanStringArray(body.q1),
    q2: cleanStringArray(body.q2),
    q3: body.q3 ? String(body.q3) : null,
    q4: cleanStringArray(body.q4),
    q5: body.q5 ? String(body.q5) : null,
  };
}

// POST /api/survey — 설문 제출 + 추천 결과
// { q1: ["문화 / 예술", "IT / 코딩"], q2: [...], q3: "처음이에요 · ...", q4: [...], q5: "주 1회" }
router.post(
  '/',
  ah(async (req, res) => {
    const answers = cleanAnswers(req.body);
    if (!answers.q1.length) throw new HttpError(400, 'Q1(관심 분야)을 하나 이상 골라 주세요.');
    await prisma.surveyResponse.create({ data: { userId: req.user.id, answers } });
    res.status(201).json({ answers, recommendations: await recommend(answers) });
  }),
);

// GET /api/survey/recommendations — 마지막 설문 기준으로 다시 추천
router.get(
  '/recommendations',
  ah(async (req, res) => {
    const last = await prisma.surveyResponse.findFirst({ where: { userId: req.user.id }, orderBy: { createdAt: 'desc' } });
    if (!last) return res.json({ answers: null, recommendations: [] });
    const answers = cleanAnswers(asObject(last.answers));
    res.json({ answers, recommendations: await recommend(answers) });
  }),
);

module.exports = router;
