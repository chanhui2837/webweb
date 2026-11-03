import { Router } from 'express';
import { z } from 'zod';
import { Bookmark, EditorDoc, Illustration, Like, User } from '../models/index.js';
import { isAdmin, optionalAuth, requireAuth } from '../middleware/auth.js';
import { writeLimiter } from '../middleware/rateLimits.js';
import { ah, assertId, badRequest, escapeRegex, forbidden, notFound, pageParams, parse } from '../utils/http.js';
import { cleanText, imageUrlField, text } from '../utils/validators.js';
import { AUTHOR_FIELDS, illustrationCard } from '../utils/serialize.js';
import { grantReward, walletSummary } from '../services/cookieService.js';
import { deleteIllustrationCascade, registerView } from '../services/contentService.js';

const router = Router();
export const PUBLIC_ILLUST = { status: 'published', visibility: 'public', hidden: false };
const SORTS = {
  latest: { publishedAt: -1, _id: -1 },
  popular: { likeCount: -1, viewCount: -1, _id: -1 },
  views: { viewCount: -1, _id: -1 },
};

const tagsField = z
  .array(z.string())
  .max(10, '태그는 최대 10개까지 입력할 수 있습니다.')
  .transform((arr) => [...new Set(arr.map((t) => cleanText(t).replace(/^#/, '').slice(0, 20)).filter(Boolean))]);

/* ---------- 공개 그림 목록 ---------- */
router.get('/', ah(async (req, res) => {
  const { page, limit, skip } = pageParams(req.query, 30);
  const filter = { ...PUBLIC_ILLUST };
  const q = String(req.query.q || '').trim().slice(0, 50);
  const author = String(req.query.author || '').trim().slice(0, 30);
  if (q) {
    const rx = { $regex: escapeRegex(q), $options: 'i' };
    filter.$or = [{ title: rx }, { tags: rx }];
  }
  if (author) {
    const rx = { $regex: escapeRegex(author), $options: 'i' };
    const users = await User.find({ $or: [{ nickname: rx }, { username: rx }] }).select('_id').limit(200).lean();
    filter.author = { $in: users.map((u) => u._id) };
  }
  const sort = SORTS[req.query.sort] || SORTS.latest;
  const [items, total] = await Promise.all([
    Illustration.find(filter).sort(sort).skip(skip).limit(limit).populate('author', AUTHOR_FIELDS).lean(),
    Illustration.countDocuments(filter),
  ]);
  res.json({ items: items.map((i) => illustrationCard(i)), total, page, pages: Math.ceil(total / limit) });
}));

/* ---------- 그림 프로젝트 생성 ---------- */
router.post('/', requireAuth, writeLimiter, ah(async (req, res) => {
  const { title } = parse(z.object({ title: text(1, 60, '그림 제목') }), req.body);
  const count = await Illustration.countDocuments({ author: req.user._id, status: 'draft' });
  if (count >= 100) throw forbidden('임시저장 그림은 최대 100개까지 만들 수 있습니다.');
  const doc = await EditorDoc.create({ owner: req.user._id, kind: 'illustration', data: null });
  const ill = await Illustration.create({ author: req.user._id, title, editorDoc: doc._id });
  res.status(201).json({ illustration: illustrationCard(ill) });
}));

async function loadIll(id) {
  assertId(id, '그림 ID');
  const ill = await Illustration.findById(id).populate('author', AUTHOR_FIELDS);
  if (!ill) throw notFound('그림을 찾을 수 없습니다.');
  return ill;
}
const isOwner = (user, ill) => !!user && String(user._id) === String(ill.author?._id || ill.author);

/* ---------- 편집용 (작가 전용) ---------- */
router.get('/:id/edit', requireAuth, ah(async (req, res) => {
  const ill = await loadIll(req.params.id);
  if (!isOwner(req.user, ill)) throw forbidden('내 그림만 편집할 수 있습니다.');
  res.json({ illustration: illustrationCard(ill, { editorDocId: ill.editorDoc ? String(ill.editorDoc) : null }) });
}));

/* ---------- 상세 ---------- */
router.get('/:id', optionalAuth, ah(async (req, res) => {
  const ill = await loadIll(req.params.id);
  const owner = isOwner(req.user, ill);
  const visible = ill.status === 'published' && ill.visibility === 'public' && !ill.hidden;
  if (!visible && !owner && !isAdmin(req.user)) throw notFound('비공개이거나 존재하지 않는 그림입니다.');
  if (visible && (await registerView(req, 'illustration', ill._id))) {
    await Illustration.updateOne({ _id: ill._id }, { $inc: { viewCount: 1 } });
    ill.viewCount += 1;
  }
  let liked = false;
  let saved = false;
  if (req.user) {
    [liked, saved] = await Promise.all([
      Like.exists({ user: req.user._id, targetType: 'illustration', target: ill._id }).then(Boolean),
      Bookmark.exists({ user: req.user._id, targetType: 'illustration', target: ill._id }).then(Boolean),
    ]);
  }
  const more = await Illustration.find({ ...PUBLIC_ILLUST, author: ill.author._id, _id: { $ne: ill._id } })
    .sort({ publishedAt: -1 }).limit(6).populate('author', AUTHOR_FIELDS).lean();
  res.json({ illustration: illustrationCard(ill), viewer: { liked, saved, isOwner: owner }, moreByAuthor: more.map((i) => illustrationCard(i)) });
}));

const updateSchema = z.object({
  title: text(1, 60, '그림 제목').optional(),
  description: text(0, 2000, '설명').optional(),
  tags: tagsField.optional(),
  visibility: z.enum(['public', 'private']).optional(),
});

router.patch('/:id', requireAuth, ah(async (req, res) => {
  const ill = await loadIll(req.params.id);
  if (!isOwner(req.user, ill)) throw forbidden('내 그림만 수정할 수 있습니다.');
  Object.assign(ill, parse(updateSchema, req.body));
  await ill.save();
  res.json({ illustration: illustrationCard(ill) });
}));

/* ---------- 업로드(공개) — 편집기에서 렌더링한 이미지 반영 ---------- */
const publishSchema = updateSchema.extend({
  imageUrl: imageUrlField.refine((v) => v !== '', '그림 이미지가 필요합니다.'),
  width: z.number().int().min(1).max(20000).optional(),
  height: z.number().int().min(1).max(40000).optional(),
});

router.post('/:id/publish', requireAuth, writeLimiter, ah(async (req, res) => {
  const ill = await loadIll(req.params.id);
  if (!isOwner(req.user, ill)) throw forbidden('내 그림만 업로드할 수 있습니다.');
  const data = parse(publishSchema, req.body);
  Object.assign(ill, data);
  const first = ill.status !== 'published';
  ill.status = 'published';
  if (first) ill.publishedAt = new Date();
  await ill.save();
  let reward = null;
  if (first && ill.visibility === 'public') {
    const claimed = await Illustration.findOneAndUpdate({ _id: ill._id, publishRewarded: false }, { $set: { publishRewarded: true } });
    if (claimed) reward = await grantReward(req.user, 'publish_illustration', String(ill._id));
  }
  res.json({ illustration: illustrationCard(ill), reward, wallet: await walletSummary(req.user) });
}));

/* ---------- 공개 취소 (다시 임시저장 상태로) ---------- */
router.post('/:id/unpublish', requireAuth, ah(async (req, res) => {
  const ill = await loadIll(req.params.id);
  if (!isOwner(req.user, ill)) throw forbidden();
  if (ill.status !== 'published') throw badRequest('공개된 그림이 아닙니다.');
  ill.status = 'draft';
  await ill.save();
  res.json({ illustration: illustrationCard(ill) });
}));

router.delete('/:id', requireAuth, ah(async (req, res) => {
  const ill = await loadIll(req.params.id);
  if (!isOwner(req.user, ill) && !isAdmin(req.user)) throw forbidden();
  await deleteIllustrationCascade(ill);
  res.json({ ok: true });
}));

export default router;
