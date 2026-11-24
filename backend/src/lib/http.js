// 에러 처리 도우미

// 원하는 HTTP 상태코드와 메시지로 에러를 던질 때 사용: throw new HttpError(404, '없음')
class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// async 라우터에서 난 에러를 Express 에러 핸들러로 넘겨줌
const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// URL 파라미터를 숫자로 변환 (숫자가 아니면 400)
function toId(value, name = 'id') {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw new HttpError(400, `${name} 값이 올바르지 않습니다.`);
  return n;
}

// 필수 값 검사: requireFields(req.body, ['title', 'content'])
function requireFields(body, fields) {
  const missing = fields.filter((f) => {
    const v = body?.[f];
    return v === undefined || v === null || (typeof v === 'string' && v.trim() === '');
  });
  if (missing.length) throw new HttpError(400, `필수 항목이 비어 있습니다: ${missing.join(', ')}`);
}

module.exports = { HttpError, ah, toId, requireFields };
