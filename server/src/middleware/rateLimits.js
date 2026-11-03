import { rateLimit, ipKeyGenerator } from 'express-rate-limit';
import { env } from '../config/env.js';

const common = {
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: () => env.isTest,
  message: { error: '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.', code: 'RATE_LIMIT' },
};

export const apiLimiter = rateLimit({ ...common, windowMs: 60 * 1000, limit: 300 });

// 로그인: IP + 아이디 조합 기준 15분에 10회
export const loginLimiter = rateLimit({
  ...common,
  windowMs: 15 * 60 * 1000,
  limit: 10,
  keyGenerator: (req) => `${ipKeyGenerator(req.ip)}:${String(req.body?.username || '').toLowerCase()}`,
  message: { error: '로그인 시도가 너무 많습니다. 15분 후 다시 시도해 주세요.', code: 'RATE_LIMIT' },
});

export const signupLimiter = rateLimit({ ...common, windowMs: 60 * 60 * 1000, limit: 10 });
export const verifyLimiter = rateLimit({ ...common, windowMs: 15 * 60 * 1000, limit: 10 });
export const uploadLimiter = rateLimit({ ...common, windowMs: 60 * 1000, limit: 40 });
export const writeLimiter = rateLimit({ ...common, windowMs: 60 * 1000, limit: 30 });
