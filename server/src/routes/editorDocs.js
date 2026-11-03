import { Router } from 'express';
import { EditorDoc } from '../models/index.js';
import { requireAuth } from '../middleware/auth.js';
import { ah, assertId, badRequest, forbidden, notFound } from '../utils/http.js';

const router = Router();
const MAX_BYTES = 13 * 1024 * 1024;
const MAX_LAYERS = 30;
const MAX_ITEMS = 400;

function validateDoc(data) {
  if (data === null) return;
  if (typeof data !== 'object' || Array.isArray(data)) throw badRequest('편집 데이터 형식이 올바르지 않습니다.');
  const { width, height, layers } = data;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 50 || height < 50 || width > 4000 || height > 12000) {
    throw badRequest('캔버스 크기는 가로 50~4000px, 세로 50~12000px 이어야 합니다.');
  }
  if (!Array.isArray(layers) || layers.length < 1 || layers.length > MAX_LAYERS) throw badRequest(`레이어는 1~${MAX_LAYERS}개까지 가능합니다.`);
  let items = 0;
  for (const l of layers) {
    if (!l || typeof l !== 'object') throw badRequest('레이어 데이터가 올바르지 않습니다.');
    if (l.bitmap != null && (typeof l.bitmap !== 'string' || !l.bitmap.startsWith('data:image/png;base64,'))) {
      throw badRequest('레이어 이미지 형식이 올바르지 않습니다.');
    }
    if (l.items != null && !Array.isArray(l.items)) throw badRequest('아이템 데이터가 올바르지 않습니다.');
    items += l.items?.length || 0;
    for (const it of l.items || []) {
      // 이미지 아이템은 업로드된 이미지 주소만 허용
      if (it?.type === 'image' && !(typeof it.src === 'string' && (it.src.startsWith('/uploads/') || it.src.startsWith('https://res.cloudinary.com/')))) {
        throw badRequest('이미지 아이템은 업로드된 이미지만 사용할 수 있습니다.');
      }
    }
  }
  if (items > MAX_ITEMS) throw badRequest(`아이템은 최대 ${MAX_ITEMS}개까지 배치할 수 있습니다.`);
}

async function loadOwned(req) {
  assertId(req.params.id, '문서 ID');
  const doc = await EditorDoc.findById(req.params.id);
  if (!doc) throw notFound('편집 데이터를 찾을 수 없습니다.');
  if (String(doc.owner) !== String(req.user._id)) throw forbidden('내 작품만 불러올 수 있습니다.');
  return doc;
}

router.get('/:id', requireAuth, ah(async (req, res) => {
  const doc = await loadOwned(req);
  res.json({ id: String(doc._id), data: doc.data, updatedAt: doc.updatedAt });
}));

/** 편집기 임시저장 (레이어·아이템 전체 저장) */
router.put('/:id', requireAuth, ah(async (req, res) => {
  const doc = await loadOwned(req);
  const data = req.body?.data ?? null;
  validateDoc(data);
  const size = data ? Buffer.byteLength(JSON.stringify(data)) : 0;
  if (size > MAX_BYTES) throw badRequest('작품 데이터가 너무 큽니다(13MB 초과). 레이어 수나 캔버스 크기를 줄여 주세요.');
  doc.data = data;
  doc.byteSize = size;
  doc.markModified('data');
  await doc.save();
  res.json({ ok: true, updatedAt: doc.updatedAt, byteSize: size });
}));

export default router;
