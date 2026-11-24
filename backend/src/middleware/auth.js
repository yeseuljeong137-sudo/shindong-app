const jwt = require('jsonwebtoken');
const prisma = require('../lib/prisma');
const { HttpError } = require('../lib/http');

// 로그인 토큰 발급 (7일 유효)
function signToken(user) {
  return jwt.sign(
    { userId: user.id, stId: user.stId, name: user.name, isAdmin: user.isAdmin },
    process.env.JWT_SECRET,
    { expiresIn: '7d' },
  );
}

function readToken(req) {
  const header = req.headers.authorization || '';
  return header.startsWith('Bearer ') ? header.slice(7) : null;
}

// 로그인 필수: "Authorization: Bearer <토큰>" 검사 → req.user = { id, stId, name, isAdmin }
function requireAuth(req, res, next) {
  const token = readToken(req);
  if (!token) return next(new HttpError(401, '로그인이 필요합니다.'));
  try {
    const p = jwt.verify(token, process.env.JWT_SECRET);
    req.user = { id: p.userId, stId: p.stId, name: p.name, isAdmin: !!p.isAdmin };
    next();
  } catch {
    next(new HttpError(401, '로그인이 만료되었거나 토큰이 올바르지 않습니다.'));
  }
}

// 로그인 선택: 토큰이 있으면 req.user 채우고, 없어도 통과 (동아리 목록처럼 비로그인도 보는 화면)
function optionalAuth(req, res, next) {
  const token = readToken(req);
  if (token) {
    try {
      const p = jwt.verify(token, process.env.JWT_SECRET);
      req.user = { id: p.userId, stId: p.stId, name: p.name, isAdmin: !!p.isAdmin };
    } catch {
      // 잘못된 토큰이면 비로그인으로 취급
    }
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.user?.isAdmin) return next(new HttpError(403, '관리자만 사용할 수 있습니다.'));
  next();
}

// 동아리 소속 확인 (라우터 안에서 호출)
async function getMembership(userId, clubId) {
  if (!userId) return null;
  return prisma.membership.findUnique({ where: { userId_clubId: { userId, clubId } } });
}

async function assertClubExists(clubId) {
  const club = await prisma.club.findUnique({ where: { id: clubId } });
  if (!club) throw new HttpError(404, '동아리를 찾을 수 없습니다.');
  return club;
}

async function assertMember(userId, clubId) {
  await assertClubExists(clubId);
  const m = await getMembership(userId, clubId);
  if (!m) throw new HttpError(403, '동아리 회원만 이용할 수 있습니다.');
  return m;
}

async function assertPresident(userId, clubId) {
  const m = await assertMember(userId, clubId);
  if (m.role !== 'PRESIDENT') throw new HttpError(403, '동아리 회장만 할 수 있습니다.');
  return m;
}

module.exports = {
  signToken,
  requireAuth,
  optionalAuth,
  requireAdmin,
  getMembership,
  assertClubExists,
  assertMember,
  assertPresident,
};
