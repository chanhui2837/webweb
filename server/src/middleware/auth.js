import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import { env } from '../config/env.js';
import { User } from '../models/index.js';
import { forbidden, unauthorized } from '../utils/http.js';

export const AUTH_COOKIE = 'ww_token';
export const CSRF_COOKIE = 'ww_csrf';

function cookieBase() {
  return {
    sameSite: 'lax',
    secure: env.isProd,
    path: '/',
  };
}

export function issueSession(res, user) {
  const token = jwt.sign({ sub: user._id.toString(), v: user.tokenVersion }, env.jwtSecret, {
    expiresIn: `${env.jwtExpiresDays}d`,
    algorithm: 'HS256',
  });
  res.cookie(AUTH_COOKIE, token, {
    ...cookieBase(),
    httpOnly: true,
    maxAge: env.jwtExpiresDays * 86400000,
  });
  setCsrfCookie(res);
}

export function clearSession(res) {
  res.clearCookie(AUTH_COOKIE, { ...cookieBase(), httpOnly: true });
}

export function setCsrfCookie(res) {
  const token = crypto.randomBytes(24).toString('hex');
  res.cookie(CSRF_COOKIE, token, { ...cookieBase(), httpOnly: false, maxAge: 30 * 86400000 });
  return token;
}

/**
 * Double-submit CSRF 방어.
 * 상태를 바꾸는 요청(POST/PUT/PATCH/DELETE)은 쿠키 ww_csrf 값과 X-CSRF-Token 헤더 값이 일치해야 한다.
 * (다른 사이트는 우리 쿠키 값을 읽을 수 없으므로 헤더를 맞출 수 없음) + SameSite=Lax 이중 방어.
 */
export function csrfProtection(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    if (!req.cookies?.[CSRF_COOKIE]) setCsrfCookie(res);
    return next();
  }
  const cookie = req.cookies?.[CSRF_COOKIE];
  const header = req.get('x-csrf-token');
  if (!cookie || !header || cookie.length !== header.length ||
      !crypto.timingSafeEqual(Buffer.from(cookie), Buffer.from(header))) {
    return res.status(403).json({ error: '보안 토큰이 만료되었습니다. 페이지를 새로고침한 뒤 다시 시도해 주세요.', code: 'CSRF' });
  }
  return next();
}

async function loadUser(req) {
  const token = req.cookies?.[AUTH_COOKIE];
  if (!token) return null;
  let payload;
  try {
    payload = jwt.verify(token, env.jwtSecret, { algorithms: ['HS256'] });
  } catch {
    return null;
  }
  const user = await User.findById(payload.sub);
  if (!user || user.tokenVersion !== payload.v) return null;
  return user;
}

/** 로그인 사용자가 있으면 req.user 에 넣고, 없어도 통과 */
export async function optionalAuth(req, res, next) {
  try {
    const user = await loadUser(req);
    if (user && user.status === 'active') req.user = user;
    next();
  } catch (e) {
    next(e);
  }
}

export async function requireAuth(req, res, next) {
  try {
    const user = await loadUser(req);
    if (!user) throw unauthorized();
    if (user.status !== 'active') {
      clearSession(res);
      throw forbidden(`이용이 정지된 계정입니다.${user.suspendedReason ? ` (사유: ${user.suspendedReason})` : ''}`);
    }
    req.user = user;
    next();
  } catch (e) {
    next(e);
  }
}

/** 관리자 권한은 항상 서버 DB 의 role 로 판단한다 (클라이언트 값 신뢰 X) */
export function requireAdmin(req, res, next) {
  if (!req.user) return next(unauthorized());
  if (req.user.role !== 'admin') return next(forbidden('관리자만 접근할 수 있습니다.'));
  return next();
}

export const isAdmin = (user) => !!user && user.role === 'admin';
