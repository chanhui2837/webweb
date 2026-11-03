import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { v2 as cloudinary } from 'cloudinary';
import { env } from '../config/env.js';
import { HttpError } from '../utils/http.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const LOCAL_UPLOAD_DIR = path.resolve(__dirname, '../../uploads');

export const useCloudinary = Boolean(env.cloudinary.cloudName && env.cloudinary.apiKey && env.cloudinary.apiSecret);

if (useCloudinary) {
  cloudinary.config({
    cloud_name: env.cloudinary.cloudName,
    api_key: env.cloudinary.apiKey,
    api_secret: env.cloudinary.apiSecret,
    secure: true,
  });
} else if (env.isProd) {
  console.warn('[storage] ⚠ Cloudinary 환경변수가 없어 로컬 디스크에 저장합니다. Render 에서는 재배포/재시작 시 이미지가 사라지므로 반드시 Cloudinary 를 설정하세요.');
}

/** 파일 시그니처(매직 바이트)로 실제 이미지 형식을 판별 — 확장자/Content-Type 위조 방지 */
export function sniffImageType(buf) {
  if (!buf || buf.length < 12) return null;
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'png';
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.slice(0, 4).toString('ascii') === 'RIFF' && buf.slice(8, 12).toString('ascii') === 'WEBP') return 'webp';
  if (buf.slice(0, 6).toString('ascii') === 'GIF87a' || buf.slice(0, 6).toString('ascii') === 'GIF89a') return 'gif';
  return null;
}

const MIME = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif' };

/**
 * 이미지 버퍼를 영구 저장소에 저장하고 { url, publicId } 를 반환.
 * @param {Buffer} buffer
 * @param {string} folder 하위 폴더 (avatars, covers, pages, ...)
 */
export async function saveImage(buffer, folder) {
  const type = sniffImageType(buffer);
  if (!type) throw new HttpError(400, '지원하지 않는 이미지 형식입니다. (PNG, JPG, WEBP, GIF)');

  if (useCloudinary) {
    const result = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { folder: `${env.cloudinary.folder}/${folder}`, resource_type: 'image' },
        (err, r) => (err ? reject(err) : resolve(r))
      );
      stream.end(buffer);
    });
    return { url: result.secure_url, publicId: result.public_id, width: result.width, height: result.height };
  }

  const name = `${Date.now().toString(36)}-${crypto.randomBytes(8).toString('hex')}.${type}`;
  const dir = path.join(LOCAL_UPLOAD_DIR, folder);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, name), buffer);
  return { url: `/uploads/${folder}/${name}`, publicId: `local:${folder}/${name}` };
}

export async function deleteImage(publicId) {
  if (!publicId) return;
  try {
    if (publicId.startsWith('local:')) {
      const rel = publicId.slice(6);
      const full = path.resolve(LOCAL_UPLOAD_DIR, rel);
      if (full.startsWith(LOCAL_UPLOAD_DIR)) await fs.unlink(full);
    } else if (useCloudinary) {
      await cloudinary.uploader.destroy(publicId);
    }
  } catch {
    /* 삭제 실패는 무시 */
  }
}

export function mimeOf(type) {
  return MIME[type];
}
