import { Router } from 'express';
import { z } from 'zod';
import { Episode, Like, RewardLog, Webtoon } from '../models/index.js';
import { isAdmin, optionalAuth, requireAuth } from '../middleware/auth.js';
import { writeLimiter } from '../middleware/rateLimits.js';
import { ah, assertId, badRequest, forbidden, HttpError, notFound, parse } from '../utils/http.js';
import { imageUrlField, text } from '../utils/validators.js';
import { parseKstDateTime } from '../utils/time.js';
import { AUTHOR_FIELDS, episodeSummary, webtoonCard } from '../utils/serialize.js';
import { cancelSchedule, episodeAccess, publishNow, schedule } from '../services/episodeService.js';
import { grantReward, ownsPreview, PREVIEW_PRICE, purchasePreview, walletSummary } from '../services/cookieService.js';
import { deleteEpisodeCascade, registerView } from '../services/contentService.js';
import { copyEditorDoc, deleteEditorDocs } from '../services/editorDocService.js';

const router = Router();
const MAX_PAGES = 60;
const MAX_SLICES_PER_PAGE = 400; // 긴 장(합친 장)은 여러 이미지로 잘려 올라온다

async function loadEpisode(id) {
  assertId(id, '회차 ID');
  const ep = await Episode.findById(id);
  if (!ep) throw notFound('회차를 찾을 수 없습니다.');
  return ep;
}
const isOwner = (user, ep) => !!user && String(user._id) === String(ep.author);
function assertOwner(user, ep) {
  if (!isOwner(user, ep)) throw forbidden('내 회차만 편집할 수 있습니다.');
}

function editView(ep) {
  return {
    ...episodeSummary(ep),
    authorNote: ep.authorNote,
    pages: ep.pages.map((p) => ({ id: String(p._id), editorDocId: p.editorDoc ? String(p.editorDoc) : null, imageUrl: p.imageUrl, images: p.images || [], width: p.width, height: p.height })),
  };
}

/* ---------- 편집용 조회 (작가 전용) ---------- */
router.get('/:id/edit', requireAuth, ah(async (req, res) => {
  const ep = await loadEpisode(req.params.id);
  assertOwner(req.user, ep);
  const w = await Webtoon.findById(ep.webtoon).populate('author', AUTHOR_FIELDS);
  res.json({ episode: editView(ep), webtoon: webtoonCard(w) });
}));

/* ---------- 회차 정보/컷(페이지) 순서 수정 ---------- */
const patchSchema = z.object({
  title: text(1, 80, '회차 제목').optional(),
  authorNote: text(0, 500, '작가의 말').optional(),
  pageOrder: z.array(z.string()).max(MAX_PAGES).optional(), // 페이지 ID 배열(새 순서)
});

router.patch('/:id', requireAuth, ah(async (req, res) => {
  const ep = await loadEpisode(req.params.id);
  assertOwner(req.user, ep);
  const data = parse(patchSchema, req.body);
  if (data.title !== undefined) ep.title = data.title;
  if (data.authorNote !== undefined) ep.authorNote = data.authorNote;
  if (data.pageOrder) {
    const map = new Map(ep.pages.map((p) => [String(p._id), p]));
    if (data.pageOrder.length !== ep.pages.length || data.pageOrder.some((id) => !map.has(id)) || new Set(data.pageOrder).size !== ep.pages.length) {
      throw badRequest('페이지 순서 정보가 올바르지 않습니다. 새로고침 후 다시 시도해 주세요.');
    }
    ep.pages = data.pageOrder.map((id) => map.get(id));
  }
  await ep.save();
  res.json({ episode: editView(ep) });
}));

/* ---------- 페이지(그림 한 장) 추가/삭제 ---------- */
router.post('/:id/pages', requireAuth, writeLimiter, ah(async (req, res) => {
  const ep = await loadEpisode(req.params.id);
  assertOwner(req.user, ep);
  if (ep.pages.length >= MAX_PAGES) throw badRequest(`한 회차에는 최대 ${MAX_PAGES}장까지 넣을 수 있습니다.`);
  const source = req.body?.duplicateFrom ? ep.pages.id(String(req.body.duplicateFrom)) : null;
  // 복제는 서버 안에서 타일까지 통째로 복사
  const doc = await copyEditorDoc(source?.editorDoc || null, req.user._id, 'episodePage');
  const insertAt = Number.isInteger(req.body?.index) ? Math.max(0, Math.min(ep.pages.length, req.body.index)) : ep.pages.length;
  ep.pages.splice(insertAt, 0, { editorDoc: doc._id });
  await ep.save();
  res.status(201).json({ episode: editView(ep) });
}));

router.delete('/:id/pages/:pageId', requireAuth, ah(async (req, res) => {
  const ep = await loadEpisode(req.params.id);
  assertOwner(req.user, ep);
  const page = ep.pages.id(req.params.pageId);
  if (!page) throw notFound('페이지를 찾을 수 없습니다.');
  if (ep.pages.length <= 1) throw badRequest('회차에는 최소 1장의 페이지가 있어야 합니다.');
  if (page.editorDoc) await deleteEditorDocs([page.editorDoc]);
  page.deleteOne();
  await ep.save();
  res.json({ episode: editView(ep) });
}));

/* ---------- 장 합치기: 연속된 여러 장을 첫 장 하나로 (횟수 제한 없음) ----------
 * 브라우저가 합친 그림을 첫 장의 편집 문서에 먼저 저장한 뒤 이 API 를 호출한다.
 * 서버는 나머지 장(과 편집 데이터·타일)을 지우고 첫 장만 남긴다.
 */
router.post('/:id/pages/merge', requireAuth, writeLimiter, ah(async (req, res) => {
  const ep = await loadEpisode(req.params.id);
  assertOwner(req.user, ep);
  const { pageIds } = parse(z.object({ pageIds: z.array(z.string()).min(2).max(MAX_PAGES) }), req.body);
  const index = ep.pages.findIndex((p) => String(p._id) === pageIds[0]);
  if (index < 0) throw badRequest('합칠 장을 찾을 수 없습니다. 새로고침해 주세요.');
  for (let i = 1; i < pageIds.length; i += 1) {
    if (String(ep.pages[index + i]?._id) !== pageIds[i]) throw badRequest('연속된 장만 합칠 수 있습니다. 새로고침 후 다시 시도해 주세요.');
  }
  const keep = ep.pages[index];
  const removed = ep.pages.slice(index + 1, index + pageIds.length);
  await deleteEditorDocs(removed.map((p) => p.editorDoc));
  ep.pages.splice(index + 1, removed.length);
  // 합친 장은 다시 렌더링해서 업로드해야 하므로 이전 이미지는 비운다 (공개 회차는 '수정 반영' 시 갱신)
  if (ep.status === 'draft') { keep.imageUrl = ''; keep.images = []; }
  await ep.save();
  res.json({ episode: editView(ep), mergedCount: pageIds.length });
}));

/* ---------- 업로드: 렌더링된 페이지 이미지 반영 + 즉시 공개/예약/수정 ---------- */
const publishSchema = z.object({
  mode: z.enum(['now', 'schedule', 'update']),
  publishAt: z.string().optional(),
  thumbnailUrl: imageUrlField.optional(),
  pages: z.array(z.object({
    id: z.string(),
    images: z.array(z.object({
      url: imageUrlField.refine((v) => v !== '', '렌더링된 페이지 이미지가 필요합니다.'),
      width: z.number().int().min(1).max(20000),
      height: z.number().int().min(1).max(20000),
    })).min(1, '렌더링된 페이지 이미지가 필요합니다.').max(MAX_SLICES_PER_PAGE),
    width: z.number().int().min(1).max(20000).optional(),
    height: z.number().int().min(1).max(600000).optional(),
  })).min(1).max(MAX_PAGES),
});

router.post('/:id/publish', requireAuth, writeLimiter, ah(async (req, res) => {
  const ep = await loadEpisode(req.params.id);
  assertOwner(req.user, ep);
  const data = parse(publishSchema, req.body);

  const map = new Map(ep.pages.map((p) => [String(p._id), p]));
  if (data.pages.length !== ep.pages.length || data.pages.some((p) => !map.has(p.id))) {
    throw badRequest('페이지 정보가 일치하지 않습니다. 임시저장 후 다시 업로드해 주세요.');
  }
  ep.pages = data.pages.map((p) => {
    const page = map.get(p.id);
    page.images = p.images;
    page.imageUrl = p.images[0].url;
    page.width = p.width || p.images[0].width;
    page.height = p.height || p.images.reduce((s, im) => s + im.height, 0);
    return page;
  });
  if (data.thumbnailUrl !== undefined) ep.thumbnailUrl = data.thumbnailUrl;
  await ep.save();

  let result = ep;
  let reward = null;
  if (data.mode === 'update') {
    if (ep.status === 'draft') throw badRequest('아직 업로드하지 않은 회차입니다. 즉시 공개 또는 예약을 선택해 주세요.');
  } else if (data.mode === 'now') {
    if (ep.status === 'published') throw badRequest('이미 공개된 회차입니다.');
    result = await publishNow(ep._id);
    if (!result) throw new HttpError(409, '회차 상태가 변경되었습니다. 새로고침해 주세요.');
    reward = await RewardLog.findOne({ user: req.user._id, type: 'publish_episode', refKey: String(ep._id) }).lean();
  } else {
    if (ep.status === 'published') throw badRequest('이미 공개된 회차는 예약할 수 없습니다.');
    const at = parseKstDateTime(data.publishAt);
    if (!at) throw badRequest('예약 날짜와 시간을 올바르게 입력해 주세요.');
    if (at.getTime() < Date.now() + 60 * 1000) throw badRequest('예약 시간은 현재 시각보다 최소 1분 이후여야 합니다.');
    if (at.getTime() > Date.now() + 365 * 86400000) throw badRequest('예약은 1년 이내로만 설정할 수 있습니다.');
    result = await schedule(ep, at);
    if (!result) throw new HttpError(409, '회차 상태가 변경되었습니다. 새로고침해 주세요.');
  }
  res.json({
    episode: editView(result),
    reward: reward ? { amount: reward.amount, label: '웹툰 회차 연재' } : null,
    wallet: await walletSummary(req.user),
  });
}));

router.post('/:id/cancel-schedule', requireAuth, ah(async (req, res) => {
  const ep = await loadEpisode(req.params.id);
  assertOwner(req.user, ep);
  if (ep.status !== 'scheduled') throw badRequest('예약된 회차가 아닙니다.');
  const r = await cancelSchedule(ep);
  res.json({ episode: editView(r || ep) });
}));

router.delete('/:id', requireAuth, ah(async (req, res) => {
  const ep = await loadEpisode(req.params.id);
  if (!isOwner(req.user, ep) && !isAdmin(req.user)) throw forbidden();
  await deleteEpisodeCascade(ep);
  res.json({ ok: true });
}));

/* ---------- 회차 감상 ---------- */
router.get('/:id', optionalAuth, ah(async (req, res) => {
  const ep = await loadEpisode(req.params.id);
  const webtoon = await Webtoon.findById(ep.webtoon).populate('author', AUTHOR_FIELDS);
  if (!webtoon) throw notFound('웹툰을 찾을 수 없습니다.');
  const owned = req.user ? await ownsPreview(req.user._id, ep._id) : false;
  const access = episodeAccess(ep, webtoon, req.user, owned);
  if (!access.canView && (access.reason === 'private' || access.reason === 'draft')) throw notFound('비공개이거나 존재하지 않는 회차입니다.');

  // 이전/다음 회차 (감상 가능한 목록 기준: 공개 + 예약)
  const visible = { webtoon: ep.webtoon, status: { $in: ['published', 'scheduled'] }, hidden: false };
  const [prev, next] = await Promise.all([
    Episode.findOne({ ...visible, number: { $lt: ep.number } }).sort({ number: -1 }).select('_id number title status publishAt').lean(),
    Episode.findOne({ ...visible, number: { $gt: ep.number } }).sort({ number: 1 }).select('_id number title status publishAt').lean(),
  ]);
  const nav = (e) => (e ? { id: String(e._id), number: e.number, title: e.title, status: e.status, publishAt: e.publishAt } : null);

  const base = {
    episode: { ...episodeSummary(ep), authorNote: ep.authorNote },
    webtoon: webtoonCard(webtoon),
    prev: nav(prev),
    next: nav(next),
    access: access.reason,
    previewPrice: PREVIEW_PRICE,
  };
  if (!access.canView) {
    return res.json({ ...base, locked: true, pages: [] });
  }

  let reward = null;
  let liked = false;
  if (access.reason === 'public' || access.reason === 'purchased') {
    if (await registerView(req, 'episode', ep._id)) {
      await Promise.all([
        Episode.updateOne({ _id: ep._id }, { $inc: { viewCount: 1 } }),
        Webtoon.updateOne({ _id: webtoon._id }, { $inc: { viewCount: 1 } }),
      ]);
      base.episode.viewCount += 1;
    }
    if (req.user) reward = await grantReward(req.user, 'view_episode', String(ep._id));
  }
  if (req.user) liked = Boolean(await Like.exists({ user: req.user._id, targetType: 'episode', target: ep._id }));
  return res.json({
    ...base,
    locked: false,
    // 각 장의 잘린 이미지들을 순서대로 이어 붙여 세로 스크롤로 보여 준다
    pages: ep.pages.flatMap((p) => {
      const imgs = p.images?.length ? p.images : (p.imageUrl ? [{ url: p.imageUrl, width: p.width, height: p.height }] : []);
      return imgs.map((im, i) => ({ id: `${p._id}-${i}`, imageUrl: im.url, width: im.width, height: im.height }));
    }),
    viewer: { liked, isOwner: isOwner(req.user, ep) },
    reward,
  });
}));

/* ---------- 예약 회차 미리보기 구매 (쿠키 3개) ---------- */
router.post('/:id/purchase', requireAuth, ah(async (req, res) => {
  const ep = await loadEpisode(req.params.id);
  const webtoon = await Webtoon.findById(ep.webtoon);
  if (!webtoon || webtoon.hidden || webtoon.visibility !== 'public' || ep.hidden) throw notFound('회차를 찾을 수 없습니다.');
  if (isOwner(req.user, ep)) throw badRequest('내 회차는 쿠키 없이 볼 수 있어요.');
  if (ep.status !== 'scheduled') throw badRequest(ep.status === 'published' ? '이미 무료로 공개된 회차입니다.' : '구매할 수 없는 회차입니다.');
  const r = await purchasePreview(req.user, ep);
  res.json({ ok: true, alreadyOwned: r.alreadyOwned, wallet: await walletSummary(req.user) });
}));

export default router;
