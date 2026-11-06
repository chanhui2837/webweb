import { Router } from 'express';
import { z } from 'zod';
import { Bookmark, EditorDoc, Episode, Like, User, Webtoon, GENRES } from '../models/index.js';
import { isAdmin, optionalAuth, requireAuth } from '../middleware/auth.js';
import { writeLimiter } from '../middleware/rateLimits.js';
import { ah, assertId, escapeRegex, forbidden, notFound, pageParams, parse } from '../utils/http.js';
import { hexColorField, imageUrlField, text } from '../utils/validators.js';
import { AUTHOR_FIELDS, episodeSummary, webtoonCard } from '../utils/serialize.js';
import { deleteWebtoonCascade } from '../services/contentService.js';

const router = Router();

export const PUBLIC_WEBTOON = { visibility: 'public', hidden: false, publishedEpisodeCount: { $gt: 0 } };
const SORTS = {
  popular: { likeCount: -1, viewCount: -1, _id: -1 },
  latest: { createdAt: -1, _id: -1 },
  views: { viewCount: -1, _id: -1 },
  updated: { lastEpisodeAt: -1, _id: -1 },
};

router.get('/genres', (req, res) => res.json({ genres: GENRES }));

/* ---------- 공개 웹툰 목록 (검색/정렬) ---------- */
router.get('/', ah(async (req, res) => {
  const { page, limit, skip } = pageParams(req.query, 24);
  const filter = { ...PUBLIC_WEBTOON };
  if (req.query.genre && GENRES.includes(req.query.genre)) filter.genre = req.query.genre;
  const q = String(req.query.q || '').trim().slice(0, 50);
  const author = String(req.query.author || '').trim().slice(0, 30);
  if (q) filter.title = { $regex: escapeRegex(q), $options: 'i' };
  if (author) {
    const rx = { $regex: escapeRegex(author), $options: 'i' };
    const users = await User.find({ $or: [{ nickname: rx }, { username: rx }] }).select('_id').limit(200).lean();
    filter.author = { $in: users.map((u) => u._id) };
  }
  const sort = SORTS[req.query.sort] || SORTS.popular;
  const [items, total] = await Promise.all([
    Webtoon.find(filter).sort(sort).skip(skip).limit(limit).populate('author', AUTHOR_FIELDS).lean(),
    Webtoon.countDocuments(filter),
  ]);
  res.json({ items: items.map((w) => webtoonCard(w)), total, page, pages: Math.ceil(total / limit) });
}));

/* ---------- 웹툰 생성 (제목·장르 필수) ---------- */
const createSchema = z.object({
  title: text(1, 60, '웹툰 제목'),
  genre: z.enum(GENRES, { error: '장르를 선택해 주세요.' }),
});

router.post('/', requireAuth, writeLimiter, ah(async (req, res) => {
  const data = parse(createSchema, req.body);
  const count = await Webtoon.countDocuments({ author: req.user._id });
  if (count >= 100) throw forbidden('웹툰 프로젝트는 최대 100개까지 만들 수 있습니다.');
  const w = await Webtoon.create({ ...data, author: req.user._id });
  await w.populate('author', AUTHOR_FIELDS);
  res.status(201).json({ webtoon: webtoonCard(w) });
}));

async function loadWebtoon(id) {
  assertId(id, '웹툰 ID');
  const w = await Webtoon.findById(id).populate('author', AUTHOR_FIELDS);
  if (!w) throw notFound('웹툰을 찾을 수 없습니다.');
  return w;
}
const isOwner = (user, w) => !!user && String(user._id) === String(w.author?._id || w.author);

/* ---------- 웹툰 상세 (감상 화면) ---------- */
router.get('/:id', optionalAuth, ah(async (req, res) => {
  const w = await loadWebtoon(req.params.id);
  const owner = isOwner(req.user, w);
  if (!owner && !isAdmin(req.user) && (w.hidden || w.visibility !== 'public')) throw notFound('비공개이거나 존재하지 않는 웹툰입니다.');

  // 감상 목록: 공개 + 예약(잠금 표시) 회차. 작가/관리자는 미리 보기 위해 동일 목록을 본다.
  const episodes = await Episode.find({ webtoon: w._id, status: { $in: ['published', 'scheduled'] }, hidden: false })
    .sort({ number: 1 }).select('-pages.editorDoc').lean();
  let liked = false;
  let bookmarked = false;
  if (req.user) {
    [liked, bookmarked] = await Promise.all([
      Like.exists({ user: req.user._id, targetType: 'webtoon', target: w._id }).then(Boolean),
      Bookmark.exists({ user: req.user._id, targetType: 'webtoon', target: w._id }).then(Boolean),
    ]);
  }
  res.json({
    webtoon: webtoonCard(w, { commentCount: w.commentCount }),
    episodes: episodes.map(episodeSummary),
    viewer: { liked, bookmarked, isOwner: owner },
  });
}));

/* ---------- 작가용 관리 화면 ---------- */
router.get('/:id/manage', requireAuth, ah(async (req, res) => {
  const w = await loadWebtoon(req.params.id);
  if (!isOwner(req.user, w)) throw forbidden('내 웹툰만 관리할 수 있습니다.');
  const episodes = await Episode.find({ webtoon: w._id }).sort({ number: -1 }).lean();
  res.json({ webtoon: webtoonCard(w), episodes: episodes.map(episodeSummary), genres: GENRES });
}));

const updateSchema = z.object({
  title: text(1, 60, '웹툰 제목').optional(),
  genre: z.enum(GENRES).optional(),
  description: text(0, 2000, '작품 소개').optional(),
  coverUrl: imageUrlField.optional(),
  thumbnailUrl: imageUrlField.optional(),
  bannerColor: hexColorField.optional(),
  visibility: z.enum(['public', 'private']).optional(),
});

router.patch('/:id', requireAuth, ah(async (req, res) => {
  const w = await loadWebtoon(req.params.id);
  if (!isOwner(req.user, w)) throw forbidden('내 웹툰만 수정할 수 있습니다.');
  const data = parse(updateSchema, req.body);
  Object.assign(w, data);
  await w.save();
  res.json({ webtoon: webtoonCard(w) });
}));

router.delete('/:id', requireAuth, ah(async (req, res) => {
  const w = await loadWebtoon(req.params.id);
  if (!isOwner(req.user, w) && !isAdmin(req.user)) throw forbidden();
  await deleteWebtoonCascade(w);
  res.json({ ok: true });
}));

/* ---------- 새 회차 생성 (임시저장 상태, 빈 페이지 1장) ---------- */
router.post('/:id/episodes', requireAuth, writeLimiter, ah(async (req, res) => {
  const w = await loadWebtoon(req.params.id);
  if (!isOwner(req.user, w)) throw forbidden('내 웹툰에만 회차를 만들 수 있습니다.');
  const { title } = parse(z.object({ title: text(1, 80, '회차 제목') }), req.body);
  const updated = await Webtoon.findByIdAndUpdate(w._id, { $inc: { episodeSeq: 1 } }, { returnDocument: 'after' });
  const doc = await EditorDoc.create({ owner: req.user._id, kind: 'episodePage', data: null });
  const ep = await Episode.create({
    webtoon: w._id,
    author: req.user._id,
    number: updated.episodeSeq,
    title,
    pages: [{ editorDoc: doc._id }],
  });
  res.status(201).json({ episode: episodeSummary(ep) });
}));

export default router;
