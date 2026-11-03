import { Router } from 'express';
import { z } from 'zod';
import {
  Comment,
  CookieInbox,
  CookieTransaction,
  Episode,
  Illustration,
  Report,
  User,
  Webtoon,
} from '../models/index.js';
import { requireAdmin, requireAuth } from '../middleware/auth.js';
import { ah, assertId, badRequest, escapeRegex, notFound, pageParams, parse } from '../utils/http.js';
import { text, usernameField } from '../utils/validators.js';
import { AUTHOR_FIELDS, authorOf, commentOut, episodeSummary, illustrationCard, webtoonCard } from '../utils/serialize.js';
import { adminAdjust, sendGift, walletSummary } from '../services/cookieService.js';
import { notify } from '../services/notificationService.js';
import {
  deleteCommentCascade,
  deleteEpisodeCascade,
  deleteIllustrationCascade,
  deleteWebtoonCascade,
} from '../services/contentService.js';

const router = Router();
// 모든 관리자 API 는 서버에서 로그인 + DB role=admin 을 검증한다.
router.use(requireAuth, requireAdmin);

router.get('/stats', ah(async (req, res) => {
  const since = new Date(Date.now() - 86400000);
  const [users, newUsers, webtoons, episodes, illustrations, comments, openReports, suspended] = await Promise.all([
    User.countDocuments(),
    User.countDocuments({ createdAt: { $gte: since } }),
    Webtoon.countDocuments(),
    Episode.countDocuments({ status: 'published' }),
    Illustration.countDocuments({ status: 'published' }),
    Comment.countDocuments(),
    Report.countDocuments({ status: 'open' }),
    User.countDocuments({ status: 'suspended' }),
  ]);
  res.json({ users, newUsers, webtoons, episodes, illustrations, comments, openReports, suspended });
}));

/* ================= 사용자 관리 ================= */
router.get('/users', ah(async (req, res) => {
  const { page, limit, skip } = pageParams(req.query, 20, 100);
  const q = String(req.query.q || '').trim().slice(0, 50);
  const filter = {};
  if (q) {
    const rx = { $regex: escapeRegex(q), $options: 'i' };
    filter.$or = [{ username: rx }, { nickname: rx }, { email: rx }, { phone: { $regex: escapeRegex(q.replace(/-/g, '')) } }];
  }
  if (['active', 'suspended'].includes(req.query.status)) filter.status = req.query.status;
  const [items, total] = await Promise.all([
    User.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    User.countDocuments(filter),
  ]);
  res.json({
    items: items.map((u) => ({
      id: String(u._id), username: u.username, nickname: u.nickname, email: u.email || '', phone: u.phone || '',
      avatarUrl: u.avatarUrl, role: u.role, status: u.status, createdAt: u.createdAt, lastLoginAt: u.lastLoginAt,
    })),
    total, page, pages: Math.ceil(total / limit),
  });
}));

async function loadUser(id) {
  assertId(id, '사용자 ID');
  const u = await User.findById(id);
  if (!u) throw notFound('사용자를 찾을 수 없습니다.');
  return u;
}

router.get('/users/:id', ah(async (req, res) => {
  const u = await loadUser(req.params.id);
  const [webtoons, illustrations, comments, transactions, wallet] = await Promise.all([
    Webtoon.find({ author: u._id }).sort({ updatedAt: -1 }).limit(50).populate('author', AUTHOR_FIELDS).lean(),
    Illustration.find({ author: u._id }).sort({ updatedAt: -1 }).limit(50).populate('author', AUTHOR_FIELDS).lean(),
    Comment.find({ author: u._id }).sort({ createdAt: -1 }).limit(30).populate('author', AUTHOR_FIELDS).lean(),
    CookieTransaction.find({ user: u._id }).sort({ createdAt: -1 }).limit(30).lean(),
    walletSummary(u),
  ]);
  res.json({
    user: { ...u.toSelf(), suspendedReason: u.suspendedReason, lastLoginAt: u.lastLoginAt, lockUntil: u.lockUntil },
    wallet,
    webtoons: webtoons.map((w) => webtoonCard(w)),
    illustrations: illustrations.map((i) => illustrationCard(i)),
    comments: comments.map((c) => ({ ...commentOut(c, req.user), content: c.content, targetType: c.targetType, targetId: String(c.target) })),
    transactions: transactions.map((t) => ({ id: String(t._id), type: t.type, amount: t.amount, balanceAfter: t.balanceAfter, reason: t.reason, createdAt: t.createdAt })),
  });
}));

router.post('/users/:id/status', ah(async (req, res) => {
  const u = await loadUser(req.params.id);
  const { status, reason } = parse(z.object({ status: z.enum(['active', 'suspended']), reason: text(0, 200, '사유').optional() }), req.body);
  if (String(u._id) === String(req.user._id)) throw badRequest('자기 자신의 계정 상태는 변경할 수 없습니다.');
  if (u.role === 'admin' && status === 'suspended') throw badRequest('관리자 계정은 정지할 수 없습니다.');
  u.status = status;
  u.suspendedReason = status === 'suspended' ? reason || '' : '';
  if (status === 'suspended') u.tokenVersion += 1; // 즉시 로그아웃
  await u.save();
  res.json({ ok: true, status: u.status });
}));

router.post('/users/:id/unlock', ah(async (req, res) => {
  const u = await loadUser(req.params.id);
  u.lockUntil = null;
  u.failedLoginCount = 0;
  await u.save();
  res.json({ ok: true });
}));

router.post('/users/:id/role', ah(async (req, res) => {
  const u = await loadUser(req.params.id);
  const { role } = parse(z.object({ role: z.enum(['user', 'admin']) }), req.body);
  if (String(u._id) === String(req.user._id)) throw badRequest('자기 자신의 권한은 변경할 수 없습니다.');
  if (u.bootstrapAdmin && role === 'user') throw badRequest('최초 관리자 계정의 권한은 해제할 수 없습니다.');
  u.role = role;
  await u.save();
  res.json({ ok: true, role: u.role });
}));

/* ================= 쿠키 지급 ================= */
router.get('/cookies/find-user', ah(async (req, res) => {
  const q = String(req.query.username || '').trim().toLowerCase().slice(0, 30);
  if (!q) return res.json({ items: [] });
  const items = await User.find({ username: { $regex: `^${escapeRegex(q)}` } }).sort({ username: 1 }).limit(10).lean();
  res.json({ items: items.map((u) => ({ id: String(u._id), username: u.username, nickname: u.nickname, avatarUrl: u.avatarUrl, status: u.status, role: u.role })) });
}));

const sendSchema = z.object({
  username: usernameField,
  amount: z.number({ error: '지급할 쿠키 수량을 입력해 주세요.' }).int('쿠키는 정수로 입력해 주세요.').min(1, '1개 이상 입력해 주세요.').max(100000, '한 번에 최대 100,000개까지 보낼 수 있습니다.'),
  message: text(0, 200, '메시지').optional(),
});

router.post('/cookies/send', ah(async (req, res) => {
  const { username, amount, message } = parse(sendSchema, req.body);
  const recipient = await User.findOne({ username });
  if (!recipient) throw notFound('해당 아이디의 사용자를 찾을 수 없습니다.');
  const item = await sendGift(req.user, recipient, amount, message || '');
  res.status(201).json({ ok: true, inboxId: String(item._id), message: `${recipient.nickname}(@${recipient.username})님에게 쿠키 ${amount}개를 보냈습니다. 수신함에서 수령하면 반영됩니다.` });
}));

router.get('/cookies/gifts', ah(async (req, res) => {
  const { page, limit, skip } = pageParams(req.query, 30);
  const [items, total] = await Promise.all([
    CookieInbox.find({}).sort({ createdAt: -1 }).skip(skip).limit(limit)
      .populate('recipient', 'username nickname avatarUrl').populate('sender', 'username nickname avatarUrl').lean(),
    CookieInbox.countDocuments({}),
  ]);
  res.json({
    items: items.map((i) => ({ id: String(i._id), amount: i.amount, message: i.message, claimed: i.claimed, claimedAt: i.claimedAt, createdAt: i.createdAt, recipient: authorOf(i.recipient), sender: authorOf(i.sender) })),
    total, page, pages: Math.ceil(total / limit),
  });
}));

router.post('/cookies/adjust', ah(async (req, res) => {
  const { userId, amount, reason } = parse(z.object({
    userId: z.string(),
    amount: z.number().int().refine((v) => v !== 0 && Math.abs(v) <= 100000, '조정 수량이 올바르지 않습니다.'),
    reason: text(1, 200, '사유'),
  }), req.body);
  const u = await loadUser(userId);
  if (u.role === 'admin') throw badRequest('관리자는 쿠키가 무제한입니다.');
  const r = await adminAdjust(req.user, u, amount, reason);
  res.json({ ok: true, balance: r.wallet.balance });
}));

/* ================= 콘텐츠 관리 ================= */
const hideSchema = z.object({ hidden: z.boolean(), reason: text(0, 200, '사유').optional() });

router.get('/webtoons', ah(async (req, res) => {
  const { page, limit, skip } = pageParams(req.query, 20, 100);
  const q = String(req.query.q || '').trim().slice(0, 50);
  const filter = q ? { title: { $regex: escapeRegex(q), $options: 'i' } } : {};
  if (req.query.hidden === 'true') filter.hidden = true;
  const [items, total] = await Promise.all([
    Webtoon.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).populate('author', AUTHOR_FIELDS).lean(),
    Webtoon.countDocuments(filter),
  ]);
  res.json({ items: items.map((w) => webtoonCard(w, { hiddenReason: w.hiddenReason })), total, page, pages: Math.ceil(total / limit) });
}));

router.get('/webtoons/:id/episodes', ah(async (req, res) => {
  assertId(req.params.id, '웹툰 ID');
  const eps = await Episode.find({ webtoon: req.params.id }).sort({ number: -1 }).lean();
  res.json({ items: eps.map(episodeSummary) });
}));

router.patch('/webtoons/:id', ah(async (req, res) => {
  assertId(req.params.id, '웹툰 ID');
  const { hidden, reason } = parse(hideSchema, req.body);
  const w = await Webtoon.findByIdAndUpdate(req.params.id, { $set: { hidden, hiddenReason: hidden ? reason || '' : '' } }, { returnDocument: 'after' });
  if (!w) throw notFound('웹툰을 찾을 수 없습니다.');
  await notify(w.author, {
    type: 'moderation',
    title: hidden ? `웹툰 「${w.title}」이(가) 관리자에 의해 숨김 처리되었습니다.` : `웹툰 「${w.title}」의 숨김이 해제되었습니다.`,
    body: hidden && reason ? `사유: ${reason}` : '', link: `/projects/webtoons/${w._id}`, actor: req.user._id,
  });
  res.json({ ok: true, hidden: w.hidden });
}));

router.delete('/webtoons/:id', ah(async (req, res) => {
  assertId(req.params.id, '웹툰 ID');
  const w = await Webtoon.findById(req.params.id);
  if (!w) throw notFound('웹툰을 찾을 수 없습니다.');
  await deleteWebtoonCascade(w);
  await notify(w.author, { type: 'moderation', title: `웹툰 「${w.title}」이(가) 운영 정책에 따라 삭제되었습니다.`, actor: req.user._id });
  res.json({ ok: true });
}));

router.patch('/episodes/:id', ah(async (req, res) => {
  assertId(req.params.id, '회차 ID');
  const { hidden } = parse(hideSchema, req.body);
  const ep = await Episode.findByIdAndUpdate(req.params.id, { $set: { hidden } }, { returnDocument: 'after' });
  if (!ep) throw notFound('회차를 찾을 수 없습니다.');
  res.json({ ok: true, hidden: ep.hidden });
}));

router.delete('/episodes/:id', ah(async (req, res) => {
  assertId(req.params.id, '회차 ID');
  const ep = await Episode.findById(req.params.id);
  if (!ep) throw notFound('회차를 찾을 수 없습니다.');
  await deleteEpisodeCascade(ep);
  res.json({ ok: true });
}));

router.get('/illustrations', ah(async (req, res) => {
  const { page, limit, skip } = pageParams(req.query, 30, 100);
  const q = String(req.query.q || '').trim().slice(0, 50);
  const filter = { status: 'published' };
  if (q) filter.title = { $regex: escapeRegex(q), $options: 'i' };
  if (req.query.hidden === 'true') filter.hidden = true;
  const [items, total] = await Promise.all([
    Illustration.find(filter).sort({ publishedAt: -1 }).skip(skip).limit(limit).populate('author', AUTHOR_FIELDS).lean(),
    Illustration.countDocuments(filter),
  ]);
  res.json({ items: items.map((i) => illustrationCard(i, { hiddenReason: i.hiddenReason })), total, page, pages: Math.ceil(total / limit) });
}));

router.patch('/illustrations/:id', ah(async (req, res) => {
  assertId(req.params.id, '그림 ID');
  const { hidden, reason } = parse(hideSchema, req.body);
  const ill = await Illustration.findByIdAndUpdate(req.params.id, { $set: { hidden, hiddenReason: hidden ? reason || '' : '' } }, { returnDocument: 'after' });
  if (!ill) throw notFound('그림을 찾을 수 없습니다.');
  await notify(ill.author, {
    type: 'moderation',
    title: hidden ? `그림 「${ill.title}」이(가) 관리자에 의해 숨김 처리되었습니다.` : `그림 「${ill.title}」의 숨김이 해제되었습니다.`,
    body: hidden && reason ? `사유: ${reason}` : '', link: `/illustrations/${ill._id}`, actor: req.user._id,
  });
  res.json({ ok: true, hidden: ill.hidden });
}));

router.delete('/illustrations/:id', ah(async (req, res) => {
  assertId(req.params.id, '그림 ID');
  const ill = await Illustration.findById(req.params.id);
  if (!ill) throw notFound('그림을 찾을 수 없습니다.');
  await deleteIllustrationCascade(ill);
  await notify(ill.author, { type: 'moderation', title: `그림 「${ill.title}」이(가) 운영 정책에 따라 삭제되었습니다.`, actor: req.user._id });
  res.json({ ok: true });
}));

/* ================= 댓글 관리 ================= */
router.get('/comments', ah(async (req, res) => {
  const { page, limit, skip } = pageParams(req.query, 30, 100);
  const q = String(req.query.q || '').trim().slice(0, 50);
  const filter = q ? { content: { $regex: escapeRegex(q), $options: 'i' } } : {};
  const [items, total] = await Promise.all([
    Comment.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).populate('author', AUTHOR_FIELDS).lean(),
    Comment.countDocuments(filter),
  ]);
  res.json({
    items: items.map((c) => ({ ...commentOut(c, req.user), content: c.content, targetType: c.targetType, targetId: String(c.target) })),
    total, page, pages: Math.ceil(total / limit),
  });
}));

router.patch('/comments/:id', ah(async (req, res) => {
  assertId(req.params.id, '댓글 ID');
  const { hidden } = parse(hideSchema, req.body);
  const c = await Comment.findByIdAndUpdate(req.params.id, { $set: { hidden } }, { returnDocument: 'after' });
  if (!c) throw notFound('댓글을 찾을 수 없습니다.');
  res.json({ ok: true, hidden: c.hidden });
}));

router.delete('/comments/:id', ah(async (req, res) => {
  assertId(req.params.id, '댓글 ID');
  const c = await Comment.findById(req.params.id);
  if (!c) throw notFound('댓글을 찾을 수 없습니다.');
  await deleteCommentCascade(c);
  res.json({ ok: true });
}));

/* ================= 신고 처리 ================= */
const TARGET_LINK = {
  webtoon: (id) => `/webtoons/${id}`,
  episode: (id) => `/episodes/${id}`,
  illustration: (id) => `/illustrations/${id}`,
  comment: () => '',
  user: () => '',
};

router.get('/reports', ah(async (req, res) => {
  const { page, limit, skip } = pageParams(req.query, 30);
  const status = ['open', 'resolved', 'dismissed'].includes(req.query.status) ? req.query.status : 'open';
  const [items, total] = await Promise.all([
    Report.find({ status }).sort({ createdAt: -1 }).skip(skip).limit(limit).populate('reporter', AUTHOR_FIELDS).lean(),
    Report.countDocuments({ status }),
  ]);
  // 대상 미리보기 정보
  const out = await Promise.all(items.map(async (r) => {
    let preview = '';
    let link = TARGET_LINK[r.targetType](r.target);
    if (r.targetType === 'webtoon') preview = (await Webtoon.findById(r.target).select('title').lean())?.title;
    if (r.targetType === 'episode') { const e = await Episode.findById(r.target).select('title number').lean(); preview = e ? `${e.number}화 ${e.title}` : ''; }
    if (r.targetType === 'illustration') preview = (await Illustration.findById(r.target).select('title').lean())?.title;
    if (r.targetType === 'comment') preview = (await Comment.findById(r.target).select('content').lean())?.content;
    if (r.targetType === 'user') { const u = await User.findById(r.target).select('username nickname').lean(); preview = u ? `${u.nickname} (@${u.username})` : ''; link = u ? `/u/${u.username}` : ''; }
    return {
      id: String(r._id), targetType: r.targetType, targetId: String(r.target), reason: r.reason, status: r.status,
      resolution: r.resolution, createdAt: r.createdAt, reporter: authorOf(r.reporter), preview: preview || '(삭제된 대상)', link,
    };
  }));
  res.json({ items: out, total, page, pages: Math.ceil(total / limit) });
}));

router.post('/reports/:id/resolve', ah(async (req, res) => {
  assertId(req.params.id, '신고 ID');
  const { action, note } = parse(z.object({ action: z.enum(['hide', 'delete', 'suspend', 'dismiss']), note: text(0, 200, '메모').optional() }), req.body);
  const r = await Report.findById(req.params.id);
  if (!r) throw notFound('신고를 찾을 수 없습니다.');
  const id = r.target;
  if (action === 'hide') {
    const Model = { webtoon: Webtoon, episode: Episode, illustration: Illustration, comment: Comment }[r.targetType];
    if (!Model) throw badRequest('숨길 수 없는 대상입니다.');
    await Model.updateOne({ _id: id }, { $set: { hidden: true } });
  } else if (action === 'delete') {
    if (r.targetType === 'webtoon') { const d = await Webtoon.findById(id); if (d) await deleteWebtoonCascade(d); }
    if (r.targetType === 'episode') { const d = await Episode.findById(id); if (d) await deleteEpisodeCascade(d); }
    if (r.targetType === 'illustration') { const d = await Illustration.findById(id); if (d) await deleteIllustrationCascade(d); }
    if (r.targetType === 'comment') { const d = await Comment.findById(id); if (d) await deleteCommentCascade(d); }
    if (r.targetType === 'user') throw badRequest('사용자 계정은 정지 처리를 이용해 주세요.');
  } else if (action === 'suspend') {
    if (r.targetType !== 'user') throw badRequest('사용자 신고에만 사용할 수 있습니다.');
    await User.updateOne({ _id: id, role: { $ne: 'admin' } }, { $set: { status: 'suspended', suspendedReason: note || '신고 누적' }, $inc: { tokenVersion: 1 } });
  }
  await Report.updateMany(
    { targetType: r.targetType, target: id, status: 'open' },
    { $set: { status: action === 'dismiss' ? 'dismissed' : 'resolved', resolvedBy: req.user._id, resolution: `${action}${note ? `: ${note}` : ''}` } }
  );
  res.json({ ok: true });
}));

export default router;
