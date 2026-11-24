// 로그인 / 회원가입
// 지금은 앱 자체 계정(학번 + 비밀번호). 나중에 학교 포털 인증을 붙이면 /login 내부만 바꾸면 됨.
const express = require('express');
const prisma = require('../lib/prisma');
const { ah, HttpError, requireFields } = require('../lib/http');
const { hashPassword, verifyPassword } = require('../lib/password');
const { signToken, requireAuth } = require('../middleware/auth');
const s = require('../lib/serializers');

const router = express.Router();

// POST /api/auth/register  { stId, password, name, department }
router.post(
  '/register',
  ah(async (req, res) => {
    requireFields(req.body, ['stId', 'password', 'name']);
    const stId = String(req.body.stId).trim();
    const { password, name, department } = req.body;

    if (!/^\d{6,10}$/.test(stId)) throw new HttpError(400, '학번은 숫자 6~10자리로 입력해 주세요.');
    if (String(password).length < 4) throw new HttpError(400, '비밀번호는 4자 이상이어야 합니다.');

    const exists = await prisma.user.findUnique({ where: { stId } });
    if (exists) throw new HttpError(409, '이미 가입된 학번입니다.');

    const user = await prisma.user.create({
      data: {
        stId,
        passwordHash: hashPassword(String(password)),
        name: String(name).trim(),
        department: department ? String(department).trim() : null,
        notificationSetting: { create: {} },
      },
    });

    res.status(201).json({ token: signToken(user), user: s.user(user) });
  }),
);

// POST /api/auth/login  { stId, password }  (로그인 화면의 "아이디" = 학번)
router.post(
  '/login',
  ah(async (req, res) => {
    requireFields(req.body, ['stId', 'password']);
    const user = await prisma.user.findUnique({ where: { stId: String(req.body.stId).trim() } });
    if (!user || !verifyPassword(String(req.body.password), user.passwordHash)) {
      throw new HttpError(401, '학번 또는 비밀번호가 올바르지 않습니다.');
    }
    res.json({ token: signToken(user), user: s.user(user) });
  }),
);

// GET /api/auth/me  — 토큰이 아직 유효한지 확인 (앱 시작 시 자동 로그인용)
router.get(
  '/me',
  requireAuth,
  ah(async (req, res) => {
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user) throw new HttpError(401, '존재하지 않는 사용자입니다.');
    res.json({ user: s.user(user) });
  }),
);

module.exports = router;
