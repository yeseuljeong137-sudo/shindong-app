// Json 필드를 항상 배열/객체로 다루기 위한 도우미
// (SQLite에선 Json이 문자열로 돌아오는 경우가 있어서 안전하게 처리)

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function asObject(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }
  return {};
}

// 요청으로 들어온 문자열 배열 정리
function cleanStringArray(value) {
  return asArray(value)
    .map((v) => String(v).trim())
    .filter(Boolean);
}

module.exports = { asArray, asObject, cleanStringArray };
