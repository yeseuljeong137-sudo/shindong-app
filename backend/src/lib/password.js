// 비밀번호 해싱 (Node 기본 crypto.scrypt 사용 → 추가 패키지 필요 없음)
const crypto = require('crypto');

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = String(stored).split(':');
  if (!salt || !hash) return false;
  const test = crypto.scryptSync(password, salt, 64);
  const original = Buffer.from(hash, 'hex');
  return original.length === test.length && crypto.timingSafeEqual(original, test);
}

module.exports = { hashPassword, verifyPassword };
