import { Router } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import mongoose from 'mongoose';
import { z } from 'zod';
import { env } from '../config/env.js';
import { User, VerificationCode, nicknameKeyOf } from '../models/index.js';
import { clearSession, issueSession, optionalAuth, requireAuth } from '../middleware/auth.js';
import { loginLimiter, signupLimiter, verifyLimiter } from '../middleware/rateLimits.js';
import { ah, badRequest, conflict, HttpError, isDupKey, parse } from '../utils/http.js';
import {
  nicknameField,
  optionalEmail,
  optionalPhone,
  passwordField,
  usernameField,
  EMAIL_RE,
  normalizePhone,
  PHONE_RE,
} from '../utils/validators.js';
import { grantSignupBonus, walletSummary } from '../services/cookieService.js';
import { channelAvailable, emailEnabled, sendVerificationCode, smsEnabled } from '../services/messenger.js';

const router = Router();

const RESERVED = new Set(['admin', 'administrator', 'root', 'system', 'webweb', 'support', 'manager', 'operator']);
const BCRYPT_ROUNDS = 12;
const MAX_FAILED = 5;
const LOCK_MINUTES = 15;
const DUMMY_HASH = bcrypt.hashSync('dummy-password-for-timing', 10);

function isReservedUsername(u) {
  return u === env.admin.username || RESERVED.has(u) || u.startsWith('admin');
}

async function meResponse(user) {
  return { user: user.toSelf(), wallet: await walletSummary(user) };
}

/* ---------- 중복 확인 ---------- */
router.get('/check-username', ah(async (req, res) => {
  const r = usernameField.safeParse(req.query.username ?? '');
  if (!r.success) return res.json({ available: false, message: r.error.issues[0].message });
  if (isReservedUsername(r.data)) return res.json({ available: false, message: '사용할 수 없는 아이디입니다.' });
  const exists = await User.exists({ username: r.data });
  return res.json({ available: !exists, message: exists ? '이미 사용 중인 아이디입니다.' : '사용 가능한 아이디입니다.' });
}));

router.get('/check-nickname', ah(async (req, res) => {
  const r = nicknameField.safeParse(req.query.nickname ?? '');
  if (!r.success) return res.json({ available: false, message: r.error.issues[0].message });
  const exists = await User.exists({ nicknameKey: nicknameKeyOf(r.data) });
  return res.json({ available: !exists, message: exists ? '이미 사용 중인 닉네임입니다.' : '사용 가능한 닉네임입니다.' });
}));

/* ---------- 회원가입 ---------- */
const registerSchema = z.object({
  username: usernameField,
  password: passwordField,
  nickname: nicknameField,
  email: optionalEmail,
  phone: optionalPhone,
});

router.post('/register', signupLimiter, ah(async (req, res) => {
  const data = parse(registerSchema, req.body);
  if (isReservedUsername(data.username)) throw badRequest('사용할 수 없는 아이디입니다.');
  if (data.password.toLowerCase().includes(data.username)) throw badRequest('비밀번호에 아이디를 포함할 수 없습니다.');

  const nicknameKey = nicknameKeyOf(data.nickname);
  const [uDup, nDup, eDup, pDup] = await Promise.all([
    User.exists({ username: data.username }),
    User.exists({ nicknameKey }),
    data.email ? User.exists({ email: data.email }) : null,
    data.phone ? User.exists({ phone: data.phone }) : null,
  ]);
  if (uDup) throw conflict('이미 사용 중인 아이디입니다.', 'USERNAME_TAKEN');
  if (nDup) throw conflict('이미 사용 중인 닉네임입니다.', 'NICKNAME_TAKEN');
  if (eDup) throw conflict('이미 가입에 사용된 이메일입니다.', 'EMAIL_TAKEN');
  if (pDup) throw conflict('이미 가입에 사용된 전화번호입니다.', 'PHONE_TAKEN');

  let user;
  try {
    user = await User.create({
      username: data.username,
      passwordHash: await bcrypt.hash(data.password, BCRYPT_ROUNDS),
      nickname: data.nickname,
      nicknameKey,
      email: data.email || undefined,
      phone: data.phone || undefined,
    });
  } catch (e) {
    if (isDupKey(e)) throw conflict('아이디·닉네임·이메일·전화번호 중 이미 사용 중인 값이 있습니다.', 'DUPLICATE');
    throw e;
  }
  await grantSignupBonus(user._id);
  issueSession(res, user);
  res.status(201).json({ ...(await meResponse(user)), message: '가입을 축하해요! 쿠키 10개를 드렸어요 🍪' });
}));

/* ---------- 로그인 / 로그아웃 ---------- */
const loginSchema = z.object({
  username: z.string().transform((v) => v.trim().toLowerCase()).refine((v) => v.length > 0, '아이디를 입력해 주세요.'),
  password: z.string().min(1, '비밀번호를 입력해 주세요.').max(128),
});

router.post('/login', loginLimiter, ah(async (req, res) => {
  const { username, password } = parse(loginSchema, req.body);
  const user = await User.findOne({ username }).select('+passwordHash');
  if (!user) {
    await bcrypt.compare(password, DUMMY_HASH); // 응답 시간으로 아이디 존재 여부를 추측하지 못하게
    throw new HttpError(401, '아이디 또는 비밀번호가 올바르지 않습니다.', 'INVALID_LOGIN');
  }
  if (user.lockUntil && user.lockUntil > new Date()) {
    const min = Math.ceil((user.lockUntil - Date.now()) / 60000);
    throw new HttpError(423, `로그인 실패가 반복되어 계정이 잠시 잠겼습니다. ${min}분 후 다시 시도해 주세요.`, 'LOCKED');
  }
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) {
    const failed = user.failedLoginCount + 1;
    const update = failed >= MAX_FAILED
      ? { failedLoginCount: 0, lockUntil: new Date(Date.now() + LOCK_MINUTES * 60000) }
      : { failedLoginCount: failed };
    await User.updateOne({ _id: user._id }, { $set: update });
    const left = MAX_FAILED - failed;
    throw new HttpError(401, left > 0
      ? `아이디 또는 비밀번호가 올바르지 않습니다. (${left}회 더 실패하면 ${LOCK_MINUTES}분간 잠깁니다)`
      : `로그인 실패가 ${MAX_FAILED}회 반복되어 ${LOCK_MINUTES}분간 로그인이 제한됩니다.`, 'INVALID_LOGIN');
  }
  if (user.status !== 'active') {
    throw new HttpError(403, `이용이 정지된 계정입니다.${user.suspendedReason ? ` (사유: ${user.suspendedReason})` : ''}`, 'SUSPENDED');
  }
  await User.updateOne({ _id: user._id }, { $set: { failedLoginCount: 0, lockUntil: null, lastLoginAt: new Date() } });
  issueSession(res, user);
  res.json(await meResponse(user));
}));

router.post('/logout', (req, res) => {
  clearSession(res);
  res.json({ ok: true });
});

router.get('/me', optionalAuth, ah(async (req, res) => {
  // 비로그인도 200 으로 응답(user:null) → 프론트 초기 로딩 단순화
  if (!req.user) return res.json({ user: null, wallet: null });
  return res.json(await meResponse(req.user));
}));

/* ---------- 아이디/비밀번호 찾기 (본인확인) ---------- */
const CODE_TTL_MIN = 10;
const MAX_ATTEMPTS = 5;
const RESEND_COOLDOWN_SEC = 60;

function hashSecret(v) {
  return crypto.createHmac('sha256', env.jwtSecret).update(String(v)).digest('hex');
}
function safeEqualHex(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
}

router.get('/recovery-channels', (req, res) => {
  res.json({
    email: channelAvailable('email'),
    phone: channelAvailable('phone'),
    devMode: !emailEnabled() && !smsEnabled() && env.devLogCodes,
  });
});

const channelSchema = z.object({
  channel: z.enum(['email', 'phone'], { error: '인증 방법을 선택해 주세요.' }),
  target: z.string().max(120).transform((v) => v.trim()),
});

function normalizeTarget(channel, target) {
  if (channel === 'email') {
    const t = target.toLowerCase();
    if (!EMAIL_RE.test(t)) throw badRequest('이메일 형식이 올바르지 않습니다.');
    return t;
  }
  const t = normalizePhone(target);
  if (!PHONE_RE.test(t)) throw badRequest('전화번호 형식이 올바르지 않습니다.');
  return t;
}

async function startVerification({ purpose, channel, target, user, label }) {
  const recent = await VerificationCode.findOne({ purpose, target, createdAt: { $gt: new Date(Date.now() - RESEND_COOLDOWN_SEC * 1000) } }).lean();
  if (recent) throw new HttpError(429, `인증번호는 ${RESEND_COOLDOWN_SEC}초 후에 다시 요청할 수 있습니다.`, 'COOLDOWN');
  if (!user) {
    // 가입 여부를 노출하지 않기 위해 가짜 요청 ID 를 돌려준다.
    return new mongoose.Types.ObjectId().toString();
  }
  const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
  const doc = await VerificationCode.create({
    purpose,
    channel,
    target,
    user: user._id,
    codeHash: hashSecret(code),
    expiresAt: new Date(Date.now() + CODE_TTL_MIN * 60000),
  });
  try {
    await sendVerificationCode(channel, target, code, label);
  } catch (e) {
    await VerificationCode.deleteOne({ _id: doc._id });
    throw e;
  }
  return doc._id.toString();
}

async function checkCode(requestId, code, purpose) {
  if (!mongoose.isValidObjectId(requestId) || !/^\d{6}$/.test(String(code || ''))) {
    throw badRequest('인증번호가 올바르지 않습니다.');
  }
  const doc = await VerificationCode.findOne({ _id: requestId, purpose, used: false, expiresAt: { $gt: new Date() } });
  if (!doc) throw badRequest('인증번호가 올바르지 않거나 만료되었습니다. 다시 요청해 주세요.');
  if (doc.attempts >= MAX_ATTEMPTS) throw new HttpError(429, '인증 시도 횟수를 초과했습니다. 인증번호를 다시 요청해 주세요.');
  if (!safeEqualHex(doc.codeHash, hashSecret(code))) {
    await VerificationCode.updateOne({ _id: doc._id }, { $inc: { attempts: 1 } });
    throw badRequest(`인증번호가 올바르지 않습니다. (남은 시도 ${MAX_ATTEMPTS - doc.attempts - 1}회)`);
  }
  return doc;
}

router.post('/find-id/request', verifyLimiter, ah(async (req, res) => {
  const { channel, target: raw } = parse(channelSchema, req.body);
  if (!channelAvailable(channel)) throw new HttpError(503, '현재 해당 인증 방법을 사용할 수 없습니다.');
  const target = normalizeTarget(channel, raw);
  const user = await User.findOne(channel === 'email' ? { email: target } : { phone: target });
  const requestId = await startVerification({ purpose: 'find_id', channel, target, user, label: '아이디 찾기' });
  res.json({ requestId, message: '입력하신 정보로 가입된 계정이 있다면 인증번호를 보냈습니다.', expiresInMin: CODE_TTL_MIN });
}));

router.post('/find-id/verify', verifyLimiter, ah(async (req, res) => {
  const doc = await checkCode(req.body?.requestId, req.body?.code, 'find_id');
  doc.used = true;
  doc.verified = true;
  await doc.save();
  const user = await User.findById(doc.user);
  if (!user) throw badRequest('계정을 찾을 수 없습니다.');
  res.json({ username: user.username, createdAt: user.createdAt });
}));

const resetReqSchema = channelSchema.extend({ username: usernameField });

router.post('/reset/request', verifyLimiter, ah(async (req, res) => {
  const { channel, target: raw, username } = parse(resetReqSchema, req.body);
  if (!channelAvailable(channel)) throw new HttpError(503, '현재 해당 인증 방법을 사용할 수 없습니다.');
  const target = normalizeTarget(channel, raw);
  const user = await User.findOne({ username, ...(channel === 'email' ? { email: target } : { phone: target }) });
  const requestId = await startVerification({ purpose: 'reset_password', channel, target, user, label: '비밀번호 재설정' });
  res.json({ requestId, message: '아이디와 등록 정보가 일치하면 인증번호를 보냈습니다.', expiresInMin: CODE_TTL_MIN });
}));

router.post('/reset/verify', verifyLimiter, ah(async (req, res) => {
  const doc = await checkCode(req.body?.requestId, req.body?.code, 'reset_password');
  const resetToken = crypto.randomBytes(32).toString('hex');
  doc.verified = true;
  doc.resetTokenHash = hashSecret(resetToken);
  doc.expiresAt = new Date(Date.now() + CODE_TTL_MIN * 60000);
  await doc.save();
  res.json({ resetToken });
}));

router.post('/reset/complete', verifyLimiter, ah(async (req, res) => {
  const { requestId, resetToken, newPassword } = parse(z.object({
    requestId: z.string(),
    resetToken: z.string().regex(/^[a-f0-9]{64}$/, '잘못된 요청입니다.'),
    newPassword: passwordField,
  }), req.body);
  if (!mongoose.isValidObjectId(requestId)) throw badRequest('잘못된 요청입니다.');
  // 원자적으로 used=true 로 전환 → 같은 토큰 재사용 불가
  const doc = await VerificationCode.findOneAndUpdate(
    { _id: requestId, purpose: 'reset_password', verified: true, used: false, expiresAt: { $gt: new Date() }, resetTokenHash: hashSecret(resetToken) },
    { $set: { used: true } },
    { returnDocument: 'after' }
  );
  if (!doc) throw badRequest('재설정 시간이 만료되었거나 잘못된 요청입니다. 처음부터 다시 진행해 주세요.');
  const user = await User.findById(doc.user);
  if (!user) throw badRequest('계정을 찾을 수 없습니다.');
  if (newPassword.toLowerCase().includes(user.username)) throw badRequest('비밀번호에 아이디를 포함할 수 없습니다.');
  await User.updateOne({ _id: user._id }, {
    $set: { passwordHash: await bcrypt.hash(newPassword, BCRYPT_ROUNDS), failedLoginCount: 0, lockUntil: null },
    $inc: { tokenVersion: 1 },
  });
  clearSession(res);
  res.json({ ok: true, message: '비밀번호가 변경되었습니다. 새 비밀번호로 로그인해 주세요.' });
}));

/* ---------- 로그인 사용자 비밀번호 변경 ---------- */
router.post('/change-password', requireAuth, ah(async (req, res) => {
  const { currentPassword, newPassword } = parse(z.object({
    currentPassword: z.string().min(1, '현재 비밀번호를 입력해 주세요.'),
    newPassword: passwordField,
  }), req.body);
  const user = await User.findById(req.user._id).select('+passwordHash');
  if (!(await bcrypt.compare(currentPassword, user.passwordHash))) throw badRequest('현재 비밀번호가 올바르지 않습니다.');
  if (currentPassword === newPassword) throw badRequest('새 비밀번호가 현재 비밀번호와 같습니다.');
  if (newPassword.toLowerCase().includes(user.username)) throw badRequest('비밀번호에 아이디를 포함할 수 없습니다.');
  user.passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
  user.tokenVersion += 1; // 다른 기기의 로그인 세션 모두 만료
  await user.save();
  issueSession(res, user);
  res.json({ ok: true, message: '비밀번호가 변경되었습니다. 다른 기기에서는 다시 로그인해야 합니다.' });
}));

export default router;
export { BCRYPT_ROUNDS };
