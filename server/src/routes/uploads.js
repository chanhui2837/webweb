import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { imageUpload } from '../middleware/upload.js';
import { uploadLimiter } from '../middleware/rateLimits.js';
import { ah, badRequest } from '../utils/http.js';
import { saveImage } from '../services/storage.js';

const router = Router();
const KINDS = new Set(['cover', 'thumbnail', 'page', 'editor', 'illustration', 'episode-thumb']);

/**
 * 이미지 업로드 (표지, 썸네일, 편집기 불러오기 이미지, 렌더링된 회차 페이지 등)
 * multipart/form-data 의 image 필드 1개, 최대 10MB, PNG/JPG/WEBP/GIF (매직바이트 검사)
 */
router.post('/image', requireAuth, uploadLimiter, imageUpload, ah(async (req, res) => {
  const kind = String(req.query.kind || 'editor');
  if (!KINDS.has(kind)) throw badRequest('잘못된 업로드 종류입니다.');
  if (!req.file) throw badRequest('이미지 파일을 선택해 주세요.');
  const saved = await saveImage(req.file.buffer, `${kind}s/${req.user._id}`);
  res.status(201).json({ url: saved.url, width: saved.width, height: saved.height });
}));

export default router;
