import mongoose from 'mongoose';
import { ZodError } from 'zod';

export class HttpError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export const badRequest = (msg, code) => new HttpError(400, msg, code);
export const unauthorized = (msg = '로그인이 필요합니다.') => new HttpError(401, msg, 'UNAUTHORIZED');
export const forbidden = (msg = '권한이 없습니다.') => new HttpError(403, msg, 'FORBIDDEN');
export const notFound = (msg = '찾을 수 없습니다.') => new HttpError(404, msg, 'NOT_FOUND');
export const conflict = (msg, code) => new HttpError(409, msg, code);

/** async 라우트 핸들러의 에러를 Express 에러 핸들러로 넘긴다. */
export const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/** zod 스키마로 검증하고 결과를 반환 (실패 시 400) */
export function parse(schema, data) {
  const r = schema.safeParse(data ?? {});
  if (!r.success) {
    const first = r.error.issues[0];
    throw new HttpError(400, first?.message || '입력값이 올바르지 않습니다.', 'VALIDATION');
  }
  return r.data;
}

export function isValidId(id) {
  return typeof id === 'string' && mongoose.isValidObjectId(id) && /^[a-f0-9]{24}$/i.test(id);
}

export function assertId(id, label = 'ID') {
  if (!isValidId(id)) throw badRequest(`${label} 형식이 올바르지 않습니다.`);
  return id;
}

export function isDupKey(err) {
  return err && (err.code === 11000 || err.code === 11001);
}

/** 정규식 특수문자 이스케이프 (검색어 주입 방지) */
export function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function pageParams(query, defLimit = 20, maxLimit = 60) {
  const page = Math.max(1, Math.min(10000, parseInt(query.page, 10) || 1));
  const limit = Math.max(1, Math.min(maxLimit, parseInt(query.limit, 10) || defLimit));
  return { page, limit, skip: (page - 1) * limit };
}

export function errorHandler(err, req, res, _next) {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message, code: err.code });
  }
  if (err instanceof ZodError) {
    return res.status(400).json({ error: err.issues[0]?.message || '입력값 오류', code: 'VALIDATION' });
  }
  if (err?.type === 'entity.too.large') {
    return res.status(413).json({ error: '요청 데이터가 너무 큽니다.', code: 'TOO_LARGE' });
  }
  if (err?.name === 'MulterError') {
    const msg = err.code === 'LIMIT_FILE_SIZE' ? '파일 용량이 제한(10MB)을 초과했습니다.' : '파일 업로드 오류입니다.';
    return res.status(400).json({ error: msg, code: err.code });
  }
  if (err instanceof mongoose.Error.CastError) {
    return res.status(400).json({ error: '잘못된 요청 형식입니다.', code: 'CAST' });
  }
  if (err instanceof mongoose.Error.ValidationError) {
    const first = Object.values(err.errors)[0];
    return res.status(400).json({ error: first?.message || '입력값 오류', code: 'VALIDATION' });
  }
  if (err?.code === 'ENOENT' || err?.status === 404 || err?.statusCode === 404) {
    // 없는 업로드 파일 등 — 서버 오류(500)가 아니라 404 로 응답
    return res.status(404).json({ error: '파일을 찾을 수 없습니다.', code: 'NOT_FOUND' });
  }
  if (isDupKey(err)) {
    return res.status(409).json({ error: '이미 존재하는 데이터입니다.', code: 'DUPLICATE' });
  }
  console.error('[error]', req.method, req.originalUrl, err);
  return res.status(500).json({ error: '서버 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.', code: 'SERVER' });
}
