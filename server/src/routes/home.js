import { Router } from 'express';
import { Bookmark, Illustration, User, Webtoon } from '../models/index.js';
import { optionalAuth } from '../middleware/auth.js';
import { ah } from '../utils/http.js';
import { AUTHOR_FIELDS, illustrationCard, webtoonCard } from '../utils/serialize.js';
import { PUBLIC_WEBTOON } from './webtoons.js';
import { PUBLIC_ILLUST } from './illustrations.js';

const router = Router();

/**
 * 추천 웹툰: 최근 30일 내 업데이트된 작품을 (좋아요×3 + 관심×5 + 조회수) 점수로 정렬.
 * 로그인 사용자는 관심 웹툰 장르와 같은 작품에 가중치를 주고, 이미 관심 등록한 작품은 제외한다.
 */
async function recommended(user) {
  let likedGenres = [];
  let excluded = [];
  if (user) {
    const marks = await Bookmark.find({ user: user._id, targetType: 'webtoon' }).select('target').limit(200).lean();
    excluded = marks.map((m) => m.target);
    if (excluded.length) {
      likedGenres = (await Webtoon.aggregate([
        { $match: { _id: { $in: excluded } } },
        { $group: { _id: '$genre', n: { $sum: 1 } } },
        { $sort: { n: -1 } },
        { $limit: 3 },
      ])).map((g) => g._id);
    }
  }
  const since = new Date(Date.now() - 30 * 86400000);
  const pipeline = [
    { $match: { ...PUBLIC_WEBTOON, _id: { $nin: excluded }, ...(user ? { author: { $ne: user._id } } : {}) } },
    {
      $addFields: {
        _score: {
          $add: [
            { $multiply: ['$likeCount', 3] },
            { $multiply: ['$bookmarkCount', 5] },
            '$viewCount',
            { $cond: [{ $gte: ['$lastEpisodeAt', since] }, 50, 0] },
            { $cond: [{ $in: ['$genre', likedGenres] }, 200, 0] },
          ],
        },
      },
    },
    { $sort: { _score: -1, lastEpisodeAt: -1 } },
    { $limit: 12 },
    { $lookup: { from: 'users', localField: 'author', foreignField: '_id', as: 'author', pipeline: [{ $project: { username: 1, nickname: 1, avatarUrl: 1 } }] } },
    { $unwind: '$author' },
  ];
  return Webtoon.aggregate(pipeline);
}

/** 창작자 추천: 공개 작품 좋아요 합계가 높은 작가 */
async function creators() {
  const [w, i] = await Promise.all([
    Webtoon.aggregate([
      { $match: PUBLIC_WEBTOON },
      { $group: { _id: '$author', likes: { $sum: '$likeCount' }, views: { $sum: '$viewCount' }, works: { $sum: 1 } } },
    ]),
    Illustration.aggregate([
      { $match: PUBLIC_ILLUST },
      { $group: { _id: '$author', likes: { $sum: '$likeCount' }, views: { $sum: '$viewCount' }, works: { $sum: 1 } } },
    ]),
  ]);
  const map = new Map();
  for (const r of [...w, ...i]) {
    const k = String(r._id);
    const cur = map.get(k) || { likes: 0, views: 0, works: 0 };
    map.set(k, { likes: cur.likes + r.likes, views: cur.views + r.views, works: cur.works + r.works });
  }
  const ranked = [...map.entries()].sort((a, b) => (b[1].likes * 5 + b[1].views) - (a[1].likes * 5 + a[1].views)).slice(0, 8);
  const users = await User.find({ _id: { $in: ranked.map(([id]) => id) }, status: 'active' }).lean();
  const uMap = new Map(users.map((u) => [String(u._id), u]));
  return ranked.filter(([id]) => uMap.has(id)).map(([id, s]) => {
    const u = uMap.get(id);
    return { id, username: u.username, nickname: u.nickname, avatarUrl: u.avatarUrl, bio: u.bio, ...s };
  });
}

router.get('/', optionalAuth, ah(async (req, res) => {
  const pop = (q) => q.populate('author', AUTHOR_FIELDS).lean();
  const [popular, latest, updated, rec, popIll, newIll, crt] = await Promise.all([
    pop(Webtoon.find(PUBLIC_WEBTOON).sort({ likeCount: -1, viewCount: -1 }).limit(12)),
    pop(Webtoon.find(PUBLIC_WEBTOON).sort({ createdAt: -1 }).limit(12)),
    pop(Webtoon.find(PUBLIC_WEBTOON).sort({ lastEpisodeAt: -1 }).limit(12)),
    recommended(req.user),
    pop(Illustration.find(PUBLIC_ILLUST).sort({ likeCount: -1, viewCount: -1 }).limit(12)),
    pop(Illustration.find(PUBLIC_ILLUST).sort({ publishedAt: -1 }).limit(12)),
    creators(),
  ]);
  res.json({
    popularWebtoons: popular.map((w) => webtoonCard(w)),
    latestWebtoons: latest.map((w) => webtoonCard(w)),
    updatedWebtoons: updated.map((w) => webtoonCard(w)),
    recommendedWebtoons: rec.map((w) => webtoonCard(w)),
    popularIllustrations: popIll.map((i) => illustrationCard(i)),
    latestIllustrations: newIll.map((i) => illustrationCard(i)),
    creators: crt,
  });
}));

export default router;
