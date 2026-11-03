import { Router } from 'express';
import mongoose from 'mongoose';
import { EditorDoc, EditorTile } from '../models/index.js';
import { requireAuth } from '../middleware/auth.js';
import { ah, assertId, badRequest, forbidden, notFound } from '../utils/http.js';

const router = Router();
const MAX_META_BYTES = 6 * 1024 * 1024;
const MAX_LAYERS = 30;
const MAX_ITEMS = 3000;
const MAX_WIDTH = 4000;
const MAX_HEIGHT = 500000; // 장을 계속 합칠 수 있도록 사실상 무제한
const MAX_TILES_PER_DOC = 20000;
const MAX_TILE_BYTES = 6 * 1024 * 1024;
const KEY_RE = /^\d{1,2},\d{1,4}$/;
const LAYER_ID_RE = /^[A-Za-z0-9_-]{1,40}$/;
const BLENDS = new Set(['normal', 'multiply', 'screen', 'add', 'overlay', 'soft-light', 'hard-light', 'color-dodge', 'color-burn', 'darken', 'lighten', 'difference', 'hue', 'saturation', 'color', 'luminosity']);

const isUploadedImage = (src) => typeof src === 'string' && (src.startsWith('/uploads/') || src.startsWith('https://res.cloudinary.com/'));

function validateMeta(data) {
  if (data === null) return;
  if (typeof data !== 'object' || Array.isArray(data)) throw badRequest('편집 데이터 형식이 올바르지 않습니다.');
  const { width, height, layers } = data;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 50 || height < 50 || width > MAX_WIDTH || height > MAX_HEIGHT) {
    throw badRequest(`캔버스 크기는 가로 50~${MAX_WIDTH}px, 세로 50~${MAX_HEIGHT.toLocaleString()}px 이어야 합니다.`);
  }
  if (!Array.isArray(layers) || layers.length < 1 || layers.length > MAX_LAYERS) throw badRequest(`레이어는 1~${MAX_LAYERS}개까지 가능합니다.`);
  let items = 0;
  const ids = new Set();
  for (const l of layers) {
    if (!l || typeof l !== 'object' || !LAYER_ID_RE.test(String(l.id || ''))) throw badRequest('레이어 데이터가 올바르지 않습니다.');
    if (ids.has(l.id)) throw badRequest('레이어 ID 가 중복되었습니다.');
    ids.add(l.id);
    if (l.blend != null && !BLENDS.has(l.blend)) throw badRequest('지원하지 않는 레이어 혼합 모드입니다.');
    if (l.bitmap != null) throw badRequest('예전 형식 데이터입니다. 편집기를 새로고침한 뒤 다시 저장해 주세요.');
    if (l.tileKeys != null && (!Array.isArray(l.tileKeys) || l.tileKeys.some((k) => !KEY_RE.test(k)))) throw badRequest('타일 정보가 올바르지 않습니다.');
    if (l.items != null && !Array.isArray(l.items)) throw badRequest('아이템 데이터가 올바르지 않습니다.');
    items += l.items?.length || 0;
    for (const it of l.items || []) {
      if (it?.type === 'image' && !isUploadedImage(it.src)) throw badRequest('이미지 아이템은 업로드된 이미지만 사용할 수 있습니다.');
    }
  }
  if (items > MAX_ITEMS) throw badRequest(`아이템은 한 장에 최대 ${MAX_ITEMS}개까지 배치할 수 있습니다.`);
}

async function loadOwned(req) {
  assertId(req.params.id, '문서 ID');
  const doc = await EditorDoc.findById(req.params.id);
  if (!doc) throw notFound('편집 데이터를 찾을 수 없습니다.');
  if (String(doc.owner) !== String(req.user._id)) throw forbidden('내 작품만 불러올 수 있습니다.');
  return doc;
}

/** 문서 메타(레이어 구조·아이템). 타일 그림은 /tiles 로 나눠 받는다. */
router.get('/:id', requireAuth, ah(async (req, res) => {
  const doc = await loadOwned(req);
  const tileCount = await EditorTile.countDocuments({ doc: doc._id });
  res.json({ id: String(doc._id), data: doc.data, tileCount, updatedAt: doc.updatedAt });
}));

/** 타일 목록 — 커서 방식으로 나눠서 받기 */
router.get('/:id/tiles', requireAuth, ah(async (req, res) => {
  const doc = await loadOwned(req);
  const limit = Math.min(60, Math.max(1, parseInt(req.query.limit, 10) || 30));
  const filter = { doc: doc._id };
  if (req.query.after) {
    if (!mongoose.isValidObjectId(req.query.after)) throw badRequest('잘못된 커서입니다.');
    filter._id = { $gt: req.query.after };
  }
  const tiles = await EditorTile.find(filter).sort({ _id: 1 }).limit(limit + 1).lean();
  const more = tiles.length > limit;
  const page = tiles.slice(0, limit);
  res.json({
    tiles: page.map((t) => ({ layer: t.layer, key: t.key, d: t.data })),
    next: more ? String(page[page.length - 1]._id) : null,
  });
}));

/** 바뀐 타일만 올리기/지우기 (증분 저장) */
router.post('/:id/tiles', requireAuth, ah(async (req, res) => {
  const doc = await loadOwned(req);
  const put = Array.isArray(req.body?.put) ? req.body.put : [];
  const del = Array.isArray(req.body?.del) ? req.body.del : [];
  if (put.length > 200 || del.length > 5000) throw badRequest('한 번에 보낼 수 있는 타일 수를 넘었습니다.');
  for (const t of put) {
    if (!t || !LAYER_ID_RE.test(String(t.layer || '')) || !KEY_RE.test(String(t.key || ''))) throw badRequest('타일 정보가 올바르지 않습니다.');
    if (typeof t.d !== 'string' || !t.d.startsWith('data:image/png;base64,') || t.d.length > MAX_TILE_BYTES) throw badRequest('타일 이미지 형식이 올바르지 않습니다.');
  }
  for (const t of del) {
    if (!t || !LAYER_ID_RE.test(String(t.layer || '')) || !KEY_RE.test(String(t.key || ''))) throw badRequest('타일 정보가 올바르지 않습니다.');
  }
  if (put.length) {
    const count = await EditorTile.countDocuments({ doc: doc._id });
    if (count + put.length > MAX_TILES_PER_DOC + 200) throw badRequest('이 장에 저장된 그림 조각이 너무 많습니다. 장을 나눠 주세요.');
    await EditorTile.bulkWrite(put.map((t) => ({
      updateOne: {
        filter: { doc: doc._id, layer: t.layer, key: t.key },
        update: { $set: { data: t.d } },
        upsert: true,
      },
    })), { ordered: false });
  }
  if (del.length) {
    await EditorTile.bulkWrite(del.map((t) => ({ deleteOne: { filter: { doc: doc._id, layer: t.layer, key: t.key } } })), { ordered: false });
  }
  res.json({ ok: true, put: put.length, del: del.length });
}));

/**
 * 메타 저장. 메타의 tileKeys 에 없는 타일(지운 레이어 등)은 정리한다.
 * 클라이언트는 타일을 먼저 올리고 마지막에 메타를 저장한다.
 */
router.put('/:id', requireAuth, ah(async (req, res) => {
  const doc = await loadOwned(req);
  const data = req.body?.data ?? null;
  validateMeta(data);
  const size = data ? Buffer.byteLength(JSON.stringify(data)) : 0;
  if (size > MAX_META_BYTES) throw badRequest('말풍선·아이템 데이터가 너무 큽니다. 아이템 수를 줄여 주세요.');
  doc.data = data;
  doc.byteSize = size;
  doc.markModified('data');
  await doc.save();
  // 참조되지 않는 타일 정리
  const keep = new Set();
  for (const l of data?.layers || []) for (const k of l.tileKeys || []) keep.add(`${l.id}|${k}`);
  const stale = [];
  for await (const t of EditorTile.find({ doc: doc._id }).select('layer key').lean().cursor()) {
    if (!keep.has(`${t.layer}|${t.key}`)) stale.push(t._id);
  }
  if (stale.length) await EditorTile.deleteMany({ _id: { $in: stale } });
  res.json({ ok: true, updatedAt: doc.updatedAt, byteSize: size, removedTiles: stale.length });
}));

export default router;
