// 날짜 표시 도우미 (앱 화면에 쓰이는 "10분 전", "2026.03.10" 같은 형식)

const pad = (n) => String(n).padStart(2, '0');

// 한국 시간 기준 Date 정보
function kst(date) {
  const d = new Date(new Date(date).getTime() + 9 * 60 * 60 * 1000);
  return {
    y: d.getUTCFullYear(),
    m: d.getUTCMonth() + 1,
    d: d.getUTCDate(),
    h: d.getUTCHours(),
    min: d.getUTCMinutes(),
  };
}

function timeAgo(date) {
  const diffSec = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (diffSec < 60) return '방금 전';
  const min = Math.floor(diffSec / 60);
  if (min < 60) return `${min}분 전`;
  const hour = Math.floor(min / 60);
  if (hour < 24) return `${hour}시간 전`;
  const day = Math.floor(hour / 24);
  if (day < 7) return `${day}일 전`;
  return formatDate(date);
}

// 2026.03.10
function formatDate(date) {
  const t = kst(date);
  return `${t.y}.${pad(t.m)}.${pad(t.d)}`;
}

// 2026.11.17 14:10
function formatDateTime(date) {
  const t = kst(date);
  return `${t.y}.${pad(t.m)}.${pad(t.d)} ${pad(t.h)}:${pad(t.min)}`;
}

// 26/11/14 (소식 임시저장 화면 형식)
function formatShortDate(date) {
  const t = kst(date);
  return `${String(t.y).slice(2)}/${pad(t.m)}/${pad(t.d)}`;
}

// 2026-03-15 (ClubModel.recruit_deadline 용)
function formatIsoDate(date) {
  if (!date) return null;
  const t = kst(date);
  return `${t.y}-${pad(t.m)}-${pad(t.d)}`;
}

module.exports = { timeAgo, formatDate, formatDateTime, formatShortDate, formatIsoDate };
