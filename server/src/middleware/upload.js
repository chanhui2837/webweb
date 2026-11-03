import multer from 'multer';
import { badRequest } from '../utils/http.js';

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10MB
const ALLOWED = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

/** 메모리에 받아서 형식 검증 후 외부 저장소(Cloudinary)로 바로 전송 — 서버 디스크에 의존하지 않음 */
export const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED.includes(file.mimetype)) return cb(badRequest('PNG, JPG, WEBP, GIF 이미지만 업로드할 수 있습니다.'));
    return cb(null, true);
  },
}).single('image');
