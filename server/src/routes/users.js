import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { Bookmark, Illustration, User, Webtoon, nicknameKeyOf } from '../models/index.js';
import { optionalAuth, requireAuth } from '../middleware/auth.js';
import { imageUpload } from '../middleware/upload.js';
import { uploadLimiter } from '../middleware/rateLimits.js';
import { ah, badRequest, conflict, isDupKey, notFound, parse } from '../utils/http.js';
import { HEX_COLOR_RE, nicknameField, optionalEmail, optionalPhone, text } from '../utils/validators.js';
import { deleteImage, saveImage } from '../services/storage.js';
import { grantReward, walletSummary } from '../services/cookieService.js';
import { AUTHOR_FIELDS, illustrationCard, webtoonCard } from '../utils/serialize.js';

const router = Router();

async function maybeProfileReward(user) {
  if (user.avatarUrl && user.bio && user.bio.trim().length >= 5) {
    return grantReward(user, 'profile_complete', 'once');
  }
  return null;
}

/* ---------- 그림판 저장 색 (펜 색 팔레트) ---------- */
export const MAX_SAVED_COLORS = 30;
const colorsSchema = z.object({
  colors: z.array(z.string().trim().toLowerCase().refine((v) => HEX_COLOR_RE.test(v), { message: '색상은 #rrggbb 형식이어야 합니다.' }))
    .max(MAX_SAVED_COLORS, { message: `색은 최대 ${MAX_SAVED_COLORS}개까지 저장할 수 있어요.` }),
});

router.get('/me/colors', requireAuth, ah(async (req, res) => {
  const u = await User.findById(req.user._id).select('savedColors').lean();
  res.json({ colors: u?.savedColors || [] });
}));

router.put('/me/colors', requireAuth, ah(async (req, res) => {
  const { colors } = parse(colorsSchema, req.body);
  const unique = [...new Set(colors)];
  await User.updateOne({ _id: req.user._id }, { $set: { savedColors: unique } });
  res.json({ colors: unique });
}));

/* ---------- 내 정보 수정 ---------- */
const updateSchema = z.object({
  nickname: nicknameField.optional(),
  bio: text(0, 500, '자기소개').optional(),
  email: optionalEmail.optional(),
  phone: optionalPhone.optional(),
  currentPassword: z.string().max(128).optional(),
});

router.patch('/me', requireAuth, ah(async (req, res) => {
  const data = parse(updateSchema, req.body);
  const user = await User.findById(req.user._id).select('+passwordHash');

  const emailChanged = data.email !== undefined && data.email !== (user.email || '');
  const phoneChanged = data.phone !== undefined && data.phone !== (user.phone || '');
  if (emailChanged || phoneChanged) {
    // 계정 복구 수단 변경은 비밀번호 재확인 필요
    if (!data.currentPassword || !(await bcrypt.compare(data.currentPassword, user.passwordHash))) {
      throw badRequest('이메일·전화번호를 변경하려면 현재 비밀번호를 정확히 입력해 주세요.');
    }
  }

  if (data.nickname !== undefined && data.nickname !== user.nickname) {
    const key = nicknameKeyOf(data.nickname);
    if (key !== user.nicknameKey && (await User.exists({ nicknameKey: key, _id: { $ne: user._id } }))) {
      throw conflict('이미 사용 중인 닉네임입니다.');
    }
    user.nickname = data.nickname;
    user.nicknameKey = key;
  }
  if (data.bio !== undefined) user.bio = data.bio;
  if (emailChanged) {
    if (data.email && (await User.exists({ email: data.email, _id: { $ne: user._id } }))) throw conflict('이미 다른 계정에서 사용 중인 이메일입니다.');
    user.email = data.email || undefined;
  }
  if (phoneChanged) {
    if (data.phone && (await User.exists({ phone: data.phone, _id: { $ne: user._id } }))) throw conflict('이미 다른 계정에서 사용 중인 전화번호입니다.');
    user.phone = data.phone || undefined;
  }
  try {
    await user.save();
  } catch (e) {
    if (isDupKey(e)) throw conflict('닉네임·이메일·전화번호 중 이미 사용 중인 값이 있습니다.');
    throw e;
  }
  const reward = await maybeProfileReward(user);
  res.json({ user: user.toSelf(), wallet: await walletSummary(user), reward });
}));

/* ---------- 프로필 사진 ---------- */
router.post('/me/avatar', requireAuth, uploadLimiter, imageUpload, ah(async (req, res) => {
  if (!req.file) throw badRequest('이미지 파일을 선택해 주세요.');
  const saved = await saveImage(req.file.buffer, 'avatars');
  const user = await User.findById(req.user._id);
  const oldId = user.avatarPublicId;
  user.avatarUrl = saved.url;
  user.avatarPublicId = saved.publicId;
  await user.save();
  if (oldId) deleteImage(oldId);
  const reward = await maybeProfileReward(user);
  res.json({ user: user.toSelf(), reward });
}));

router.delete('/me/avatar', requireAuth, ah(async (req, res) => {
  const user = await User.findById(req.user._id);
  if (user.avatarPublicId) deleteImage(user.avatarPublicId);
  user.avatarUrl = '';
  user.avatarPublicId = '';
  await user.save();
  res.json({ user: user.toSelf() });
}));

/* ---------- 내 작품 / 저장한 작품 ---------- */
router.get('/me/works', requireAuth, ah(async (req, res) => {
  const [webtoons, illustrations] = await Promise.all([
    Webtoon.find({ author: req.user._id }).sort({ updatedAt: -1 }).populate('author', AUTHOR_FIELDS).lean(),
    Illustration.find({ author: req.user._id }).sort({ updatedAt: -1 }).populate('author', AUTHOR_FIELDS).lean(),
  ]);
  res.json({ webtoons: webtoons.map((w) => webtoonCard(w)), illustrations: illustrations.map((i) => illustrationCard(i)) });
}));

router.get('/me/saved', requireAuth, ah(async (req, res) => {
  const marks = await Bookmark.find({ user: req.user._id }).sort({ createdAt: -1 }).limit(500).lean();
  const wIds = marks.filter((m) => m.targetType === 'webtoon').map((m) => m.target);
  const iIds = marks.filter((m) => m.targetType === 'illustration').map((m) => m.target);
  const [ws, is] = await Promise.all([
    Webtoon.find({ _id: { $in: wIds } }).populate('author', AUTHOR_FIELDS).lean(),
    Illustration.find({ _id: { $in: iIds } }).populate('author', AUTHOR_FIELDS).lean(),
  ]);
  const wMap = new Map(ws.map((w) => [String(w._id), w]));
  const iMap = new Map(is.map((i) => [String(i._id), i]));
  const canSee = (doc) => doc && (!doc.hidden && doc.visibility === 'public' || String(doc.author?._id) === String(req.user._id));
  res.json({
    webtoons: wIds.map((id) => wMap.get(String(id))).filter(canSee).map((w) => webtoonCard(w)),
    illustrations: iIds.map((id) => iMap.get(String(id))).filter((d) => canSee(d) && d.status === 'published').map((i) => illustrationCard(i)),
  });
}));

/* ---------- 공개 프로필 ---------- */
router.get('/:username', optionalAuth, ah(async (req, res) => {
  const username = String(req.params.username || '').toLowerCase();
  if (!/^[a-z0-9_]{1,30}$/.test(username)) throw notFound('사용자를 찾을 수 없습니다.');
  const user = await User.findOne({ username });
  if (!user || (user.status !== 'active' && req.user?.role !== 'admin')) throw notFound('사용자를 찾을 수 없습니다.');
  const [webtoons, illustrations] = await Promise.all([
    Webtoon.find({ author: user._id, visibility: 'public', hidden: false, publishedEpisodeCount: { $gt: 0 } })
      .sort({ lastEpisodeAt: -1 }).populate('author', AUTHOR_FIELDS).lean(),
    Illustration.find({ author: user._id, status: 'published', visibility: 'public', hidden: false })
      .sort({ publishedAt: -1 }).limit(120).populate('author', AUTHOR_FIELDS).lean(),
  ]);
  const totalLikes = webtoons.reduce((s, w) => s + w.likeCount, 0) + illustrations.reduce((s, i) => s + i.likeCount, 0);
  res.json({
    user: user.toPublic(),
    isMe: req.user ? String(req.user._id) === String(user._id) : false,
    stats: { webtoons: webtoons.length, illustrations: illustrations.length, totalLikes },
    webtoons: webtoons.map((w) => webtoonCard(w)),
    illustrations: illustrations.map((i) => illustrationCard(i)),
  });
}));

export default router;
