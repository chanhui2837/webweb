import { Router } from 'express';
import { Attendance, CookieInbox, CookieTransaction, Notification } from '../models/index.js';
import { requireAuth } from '../middleware/auth.js';
import { ah, assertId, pageParams } from '../utils/http.js';
import { kstDay } from '../utils/time.js';
import { authorOf } from '../utils/serialize.js';
import {
  ATTENDANCE_RULE,
  checkAttendance,
  claimGift,
  PREVIEW_PRICE,
  REWARD_RULES,
  SIGNUP_BONUS,
  walletSummary,
} from '../services/cookieService.js';

export const cookiesRouter = Router();
export const inboxRouter = Router();
export const notificationsRouter = Router();

/* ================= 쿠키 ================= */
cookiesRouter.get('/rules', (req, res) => {
  res.json({
    signupBonus: SIGNUP_BONUS,
    previewPrice: PREVIEW_PRICE,
    attendance: ATTENDANCE_RULE,
    rewards: Object.entries(REWARD_RULES).map(([type, r]) => ({ type, amount: r.amount, dailyCap: r.dailyCap, label: r.label, desc: r.desc })),
  });
});

cookiesRouter.get('/summary', requireAuth, ah(async (req, res) => {
  const today = kstDay();
  const [wallet, todayAtt, lastAtt] = await Promise.all([
    walletSummary(req.user),
    Attendance.findOne({ user: req.user._id, day: today }).lean(),
    Attendance.findOne({ user: req.user._id }).sort({ day: -1 }).lean(),
  ]);
  res.json({
    wallet,
    attendance: { checkedToday: !!todayAtt, streak: todayAtt?.streak || 0, lastDay: lastAtt?.day || null, today },
  });
}));

// type: all | earn | spend | receive
const TX_FILTER = {
  earn: { type: { $in: ['signup', 'reward', 'admin_adjust', 'refund'] }, amount: { $gt: 0 } },
  spend: { amount: { $lt: 0 } },
  receive: { type: 'receive' },
};

cookiesRouter.get('/transactions', requireAuth, ah(async (req, res) => {
  const { page, limit, skip } = pageParams(req.query, 30, 100);
  const filter = { user: req.user._id, ...(TX_FILTER[req.query.type] || {}) };
  if (!TX_FILTER[req.query.type] && req.user.role !== 'admin') filter.amount = { $ne: 0 };
  const [items, total] = await Promise.all([
    CookieTransaction.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    CookieTransaction.countDocuments(filter),
  ]);
  res.json({
    items: items.map((t) => ({
      id: String(t._id), type: t.type, amount: t.amount, balanceAfter: t.balanceAfter ?? null,
      reason: t.reason, rewardType: t.rewardType, createdAt: t.createdAt,
      ref: t.ref?.kind ? { kind: t.ref.kind, id: t.ref.id ? String(t.ref.id) : null } : null,
    })),
    total, page, pages: Math.ceil(total / limit),
  });
}));

cookiesRouter.post('/attendance', requireAuth, ah(async (req, res) => {
  const r = await checkAttendance(req.user);
  res.json({ ...r, wallet: await walletSummary(req.user) });
}));

cookiesRouter.get('/attendance', requireAuth, ah(async (req, res) => {
  // 이번 달(KST) 출석 기록
  const month = /^\d{4}-\d{2}$/.test(String(req.query.month || '')) ? req.query.month : kstDay().slice(0, 7);
  const items = await Attendance.find({ user: req.user._id, day: { $regex: `^${month}-` } }).sort({ day: 1 }).lean();
  res.json({ month, days: items.map((a) => ({ day: a.day, streak: a.streak, reward: a.reward })) });
}));

/* ================= 수신함 (관리자 쿠키 선물) ================= */
inboxRouter.get('/', requireAuth, ah(async (req, res) => {
  const { page, limit, skip } = pageParams(req.query, 30);
  const filter = { recipient: req.user._id };
  const [items, total, unclaimed] = await Promise.all([
    CookieInbox.find(filter).sort({ claimed: 1, createdAt: -1 }).skip(skip).limit(limit).populate('sender', 'username nickname avatarUrl').lean(),
    CookieInbox.countDocuments(filter),
    CookieInbox.countDocuments({ ...filter, claimed: false }),
  ]);
  res.json({
    items: items.map((i) => ({
      id: String(i._id), amount: i.amount, message: i.message, claimed: i.claimed, claimedAt: i.claimedAt,
      createdAt: i.createdAt, sender: authorOf(i.sender),
    })),
    unclaimed, total, page, pages: Math.ceil(total / limit),
  });
}));

inboxRouter.post('/:id/claim', requireAuth, ah(async (req, res) => {
  assertId(req.params.id, '선물 ID');
  const r = await claimGift(req.user, req.params.id);
  res.json({ ok: true, amount: r.item.amount, wallet: await walletSummary(req.user) });
}));

inboxRouter.post('/claim-all', requireAuth, ah(async (req, res) => {
  const pending = await CookieInbox.find({ recipient: req.user._id, claimed: false }).select('_id').lean();
  let total = 0;
  for (const p of pending) {
    try {
      const r = await claimGift(req.user, p._id);
      total += r.item.amount;
    } catch { /* 동시에 수령된 항목은 건너뜀 */ }
  }
  res.json({ ok: true, claimedCount: pending.length, amount: total, wallet: await walletSummary(req.user) });
}));

/* ================= 알림 ================= */
notificationsRouter.get('/', requireAuth, ah(async (req, res) => {
  const { page, limit, skip } = pageParams(req.query, 30, 100);
  const filter = { user: req.user._id };
  if (req.query.unread === 'true') filter.read = false;
  const [items, total] = await Promise.all([
    Notification.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).populate('actor', 'username nickname avatarUrl').lean(),
    Notification.countDocuments(filter),
  ]);
  res.json({
    items: items.map((n) => ({
      id: String(n._id), type: n.type, title: n.title, body: n.body, link: n.link, read: n.read,
      createdAt: n.createdAt, actor: n.actor ? authorOf(n.actor) : null,
    })),
    total, page, pages: Math.ceil(total / limit),
  });
}));

notificationsRouter.get('/unread-count', requireAuth, ah(async (req, res) => {
  const [notifications, gifts] = await Promise.all([
    Notification.countDocuments({ user: req.user._id, read: false }),
    CookieInbox.countDocuments({ recipient: req.user._id, claimed: false }),
  ]);
  res.json({ notifications, gifts, total: notifications + gifts });
}));

notificationsRouter.post('/read-all', requireAuth, ah(async (req, res) => {
  await Notification.updateMany({ user: req.user._id, read: false }, { $set: { read: true } });
  res.json({ ok: true });
}));

notificationsRouter.post('/:id/read', requireAuth, ah(async (req, res) => {
  assertId(req.params.id, '알림 ID');
  const read = req.body?.read !== false;
  await Notification.updateOne({ _id: req.params.id, user: req.user._id }, { $set: { read } });
  res.json({ ok: true, read });
}));

notificationsRouter.delete('/:id', requireAuth, ah(async (req, res) => {
  assertId(req.params.id, '알림 ID');
  await Notification.deleteOne({ _id: req.params.id, user: req.user._id });
  res.json({ ok: true });
}));
