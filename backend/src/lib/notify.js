// 알림 보내기 도우미 — 사용자의 알림 설정을 확인하고 꺼져 있으면 저장하지 않음
const prisma = require('./prisma');

// 알림 종류 → 알림 설정 항목
const SETTING_KEY = {
  '지원 상태': 'applicationResult',
  '마감 임박': 'schedule',
  '일정': 'schedule',
  '동아리 활동': 'clubActivity',
  '새 피드': 'newFeed',
  '이벤트': 'marketing',
};

async function notify(userIds, { type, title, content }) {
  const ids = [...new Set([].concat(userIds))].filter(Boolean);
  if (!ids.length) return;

  const key = SETTING_KEY[type];
  let targets = ids;
  if (key) {
    const settings = await prisma.notificationSetting.findMany({ where: { userId: { in: ids } } });
    const off = new Set(settings.filter((s) => s[key] === false).map((s) => s.userId));
    // 설정이 아직 없는 사용자는 기본값(schema의 @default)을 따름
    const defaultOn = { applicationResult: true, schedule: false, clubActivity: true, newFeed: false, marketing: false };
    const hasSetting = new Set(settings.map((s) => s.userId));
    targets = ids.filter((id) => (hasSetting.has(id) ? !off.has(id) : defaultOn[key]));
  }
  if (!targets.length) return;

  await prisma.notification.createMany({
    data: targets.map((userId) => ({ userId, type, title, content })),
  });
}

module.exports = { notify };
