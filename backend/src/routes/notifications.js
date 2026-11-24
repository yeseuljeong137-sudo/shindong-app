// 알림 (NotificationScreen, NotificationSettingsScreen)
const express = require('express');
const prisma = require('../lib/prisma');
const { ah, HttpError, toId } = require('../lib/http');
const { requireAuth } = require('../middleware/auth');
const s = require('../lib/serializers');

const router = express.Router();
router.use(requireAuth); // /api/notifications 에만 붙으므로 전체에 적용해도 됨

// GET /api/notifications?type=지원 상태 — 최신순
router.get(
  '/',
  ah(async (req, res) => {
    const where = { userId: req.user.id };
    if (req.query.type && req.query.type !== '전체') where.type = String(req.query.type);
    const list = await prisma.notification.findMany({ where, orderBy: { createdAt: 'desc' }, take: 100 });
    const unreadCount = await prisma.notification.count({ where: { userId: req.user.id, isRead: false } });
    res.json({ unreadCount, notifications: list.map(s.notification) });
  }),
);

// GET /api/notifications/settings — [{ key, title, subtitle, enabled }]
router.get(
  '/settings',
  ah(async (req, res) => {
    const setting = await prisma.notificationSetting.upsert({
      where: { userId: req.user.id },
      create: { userId: req.user.id },
      update: {},
    });
    res.json(s.notificationSettings(setting));
  }),
);

// PUT /api/notifications/settings — { applicationResult: true, schedule: false, ... } 바꿀 것만 보내도 됨
router.put(
  '/settings',
  ah(async (req, res) => {
    const data = {};
    for (const { key } of s.NOTIFICATION_SETTING_META) {
      if (req.body[key] !== undefined) data[key] = !!req.body[key];
    }
    const setting = await prisma.notificationSetting.upsert({
      where: { userId: req.user.id },
      create: { userId: req.user.id, ...data },
      update: data,
    });
    res.json(s.notificationSettings(setting));
  }),
);

// PATCH /api/notifications/read-all — 모두 읽음
router.patch(
  '/read-all',
  ah(async (req, res) => {
    await prisma.notification.updateMany({ where: { userId: req.user.id, isRead: false }, data: { isRead: true } });
    res.json({ ok: true });
  }),
);

// PATCH /api/notifications/:id/read — 하나 읽음
router.patch(
  '/:id/read',
  ah(async (req, res) => {
    const id = toId(req.params.id);
    const { count } = await prisma.notification.updateMany({ where: { id, userId: req.user.id }, data: { isRead: true } });
    if (!count) throw new HttpError(404, '알림을 찾을 수 없습니다.');
    res.json({ ok: true });
  }),
);

// DELETE /api/notifications/:id — 알림 삭제 (스와이프 삭제)
router.delete(
  '/:id',
  ah(async (req, res) => {
    const id = toId(req.params.id);
    const { count } = await prisma.notification.deleteMany({ where: { id, userId: req.user.id } });
    if (!count) throw new HttpError(404, '알림을 찾을 수 없습니다.');
    res.json({ ok: true });
  }),
);

module.exports = router;
