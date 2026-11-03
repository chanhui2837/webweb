import { Router } from 'express';
import { z } from 'zod';
import { Bookmark, Comment, Episode, Illustration, Like, Report, User, Webtoon } from '../models/index.js';
import { isAdmin, optionalAuth, requireAuth } from '../middleware/auth.js';
import { writeLimiter } from '../middleware/rateLimits.js';
import { ah, assertId, badRequest, forbidden, isDupKey, notFound, pageParams, parse } from '../utils/http.js';
import { text } from '../utils/validators.js';
import { AUTHOR_FIELDS, commentOut } from '../utils/serialize.js';
import { notify } from '../services/notificationService.js';
import { grantReward, ownsPreview } from '../services/cookieService.js';
import { deleteCommentCascade } from '../services/contentService.js';

const router = Router();
const MODELS = { webtoon: Webtoon, episode: Episode, illustration: Illustration };

/** 대상이 존재하고 현재 사용자가 볼 수 있는지 확인 */
async function loadVisibleTarget(type, id, user) {
  assertId(id, '대상 ID');
  const Model = MODELS[type];
  const doc = await Model.findById(id);
  if (!doc) throw notFound('대상을 찾을 수 없습니다.');
  const owner = user && String(doc.author) === String(user._id);
  if (owner || isAdmin(user)) return doc;
  if (type === 'webtoon' && (doc.hidden || doc.visibility !== 'public')) throw notFound('대상을 찾을 수 없습니다.');
  if (type === 'illustration' && (doc.hidden || doc.visibility !== 'public' || doc.status !== 'published')) throw notFound('대상을 찾을 수 없습니다.');
  if (type === 'episode') {
    const w = await Webtoon.findById(doc.webtoon).lean();
    if (!w || w.hidden || w.visibility !== 'public' || doc.hidden || doc.status === 'draft') throw notFound('대상을 찾을 수 없습니다.');
    if (doc.status === 'scheduled') {
      if (!(await ownsPreview(user?._id, doc._id))) throw forbidden('공개 전 회차입니다.');
    }
  }
  return doc;
}

/* ---------- 좋아요 (사용자별 1회) ---------- */
const likeSchema = z.object({
  targetType: z.enum(['webtoon', 'episode', 'illustration']),
  targetId: z.string(),
  like: z.boolean(),
});

router.post('/likes', requireAuth, ah(async (req, res) => {
  const { targetType, targetId, like } = parse(likeSchema, req.body);
  const doc = await loadVisibleTarget(targetType, targetId, req.user);
  const Model = MODELS[targetType];
  let changed = false;
  let reward = null;
  if (like) {
    try {
      await Like.create({ user: req.user._id, targetType, target: doc._id });
      changed = true;
    } catch (e) {
      if (!isDupKey(e)) throw e;
    }
    if (changed) {
      await Model.updateOne({ _id: doc._id }, { $inc: { likeCount: 1 } });
      if (targetType === 'illustration') {
        await notify(doc.author, {
          type: 'like', title: `${req.user.nickname}님이 내 그림을 좋아해요 ❤`, body: doc.title,
          link: `/illustrations/${doc._id}`, actor: req.user._id, dedupeKey: `like:illustration:${doc._id}:${req.user._id}`,
        });
        if (String(doc.author) !== String(req.user._id)) reward = await grantReward(req.user, 'like_illustration', String(doc._id));
      } else if (targetType === 'webtoon') {
        await notify(doc.author, {
          type: 'like', title: `${req.user.nickname}님이 내 웹툰을 좋아해요 ❤`, body: doc.title,
          link: `/webtoons/${doc._id}`, actor: req.user._id, dedupeKey: `like:webtoon:${doc._id}:${req.user._id}`,
        });
      }
    }
  } else {
    const r = await Like.deleteOne({ user: req.user._id, targetType, target: doc._id });
    if (r.deletedCount) {
      changed = true;
      await Model.updateOne({ _id: doc._id, likeCount: { $gt: 0 } }, { $inc: { likeCount: -1 } });
    }
  }
  const fresh = await Model.findById(doc._id).select('likeCount').lean();
  res.json({ liked: like, likeCount: fresh?.likeCount ?? 0, changed, reward });
}));

/* ---------- 관심 웹툰 / 그림 저장 ---------- */
const bookmarkSchema = z.object({
  targetType: z.enum(['webtoon', 'illustration']),
  targetId: z.string(),
  bookmark: z.boolean(),
});

router.post('/bookmarks', requireAuth, ah(async (req, res) => {
  const { targetType, targetId, bookmark } = parse(bookmarkSchema, req.body);
  const doc = await loadVisibleTarget(targetType, targetId, req.user);
  const Model = MODELS[targetType];
  if (bookmark) {
    try {
      await Bookmark.create({ user: req.user._id, targetType, target: doc._id });
      await Model.updateOne({ _id: doc._id }, { $inc: { bookmarkCount: 1 } });
    } catch (e) {
      if (!isDupKey(e)) throw e;
    }
  } else {
    const r = await Bookmark.deleteOne({ user: req.user._id, targetType, target: doc._id });
    if (r.deletedCount) await Model.updateOne({ _id: doc._id, bookmarkCount: { $gt: 0 } }, { $inc: { bookmarkCount: -1 } });
  }
  const fresh = await Model.findById(doc._id).select('bookmarkCount').lean();
  res.json({ bookmarked: bookmark, bookmarkCount: fresh?.bookmarkCount ?? 0 });
}));

/* ---------- 댓글 ---------- */
router.get('/comments', optionalAuth, ah(async (req, res) => {
  const targetType = req.query.targetType;
  if (!['episode', 'illustration'].includes(targetType)) throw badRequest('잘못된 대상입니다.');
  const doc = await loadVisibleTarget(targetType, String(req.query.targetId || ''), req.user);
  const { page, limit, skip } = pageParams(req.query, 30, 100);
  const filter = { targetType, target: doc._id };
  const [items, total] = await Promise.all([
    Comment.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).populate('author', AUTHOR_FIELDS).lean(),
    Comment.countDocuments(filter),
  ]);
  res.json({ items: items.map((c) => commentOut(c, req.user)), total, page, pages: Math.ceil(total / limit) });
}));

const commentSchema = z.object({
  targetType: z.enum(['episode', 'illustration']),
  targetId: z.string(),
  content: text(1, 1000, '댓글'),
});

router.post('/comments', requireAuth, writeLimiter, ah(async (req, res) => {
  const { targetType, targetId, content } = parse(commentSchema, req.body);
  const doc = await loadVisibleTarget(targetType, targetId, req.user);
  // 같은 내용 연속 도배 방지 (30초 이내 같은 대상에 같은 내용)
  const dup = await Comment.exists({ author: req.user._id, target: doc._id, content, createdAt: { $gt: new Date(Date.now() - 30000) } });
  if (dup) throw badRequest('같은 댓글을 연속으로 작성할 수 없습니다.');

  const c = await Comment.create({ author: req.user._id, targetType, target: doc._id, targetOwner: doc.author, content });
  await c.populate('author', AUTHOR_FIELDS);
  let reward = null;
  if (targetType === 'episode') {
    await Episode.updateOne({ _id: doc._id }, { $inc: { commentCount: 1 } });
    const w = await Webtoon.findByIdAndUpdate(doc.webtoon, { $inc: { commentCount: 1 } });
    await notify(doc.author, {
      type: 'comment', title: `${req.user.nickname}님이 「${w?.title || '웹툰'}」 ${doc.number}화에 댓글을 남겼어요`,
      body: content.slice(0, 100), link: `/episodes/${doc._id}#comments`, actor: req.user._id,
    });
    if (String(doc.author) !== String(req.user._id) && content.replace(/\s/g, '').length >= 5) {
      reward = await grantReward(req.user, 'comment_episode', String(doc._id));
    }
  } else {
    await Illustration.updateOne({ _id: doc._id }, { $inc: { commentCount: 1 } });
    await notify(doc.author, {
      type: 'comment', title: `${req.user.nickname}님이 내 그림 「${doc.title}」에 댓글을 남겼어요`,
      body: content.slice(0, 100), link: `/illustrations/${doc._id}#comments`, actor: req.user._id,
    });
  }
  res.status(201).json({ comment: commentOut(c, req.user), reward });
}));

router.delete('/comments/:id', requireAuth, ah(async (req, res) => {
  assertId(req.params.id, '댓글 ID');
  const c = await Comment.findById(req.params.id);
  if (!c) throw notFound('댓글을 찾을 수 없습니다.');
  if (String(c.author) !== String(req.user._id) && !isAdmin(req.user)) throw forbidden('내 댓글만 삭제할 수 있습니다.');
  await deleteCommentCascade(c);
  res.json({ ok: true });
}));

/* ---------- 신고 ---------- */
const reportSchema = z.object({
  targetType: z.enum(['webtoon', 'episode', 'illustration', 'comment', 'user']),
  targetId: z.string(),
  reason: text(2, 500, '신고 사유'),
});
const REPORT_MODELS = { ...MODELS, comment: Comment, user: User };

router.post('/reports', requireAuth, writeLimiter, ah(async (req, res) => {
  const { targetType, targetId, reason } = parse(reportSchema, req.body);
  assertId(targetId, '대상 ID');
  if (!(await REPORT_MODELS[targetType].exists({ _id: targetId }))) throw notFound('신고 대상을 찾을 수 없습니다.');
  try {
    await Report.create({ reporter: req.user._id, targetType, target: targetId, reason });
  } catch (e) {
    if (isDupKey(e)) return res.json({ ok: true, message: '이미 신고한 대상입니다. 관리자가 확인 중이에요.' });
    throw e;
  }
  res.status(201).json({ ok: true, message: '신고가 접수되었습니다. 관리자가 확인 후 조치할게요.' });
}));

export default router;
