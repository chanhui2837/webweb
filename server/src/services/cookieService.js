
import {
  Attendance,
  CookieInbox,
  CookieTransaction,
  CookieWallet,
  DailyRewardCounter,
  EpisodePurchase,
  RewardLog,
  User,
} from '../models/index.js';
import { HttpError, isDupKey } from '../utils/http.js';
import { kstDay, kstDayOffset } from '../utils/time.js';
import { notify } from './notificationService.js';

export const SIGNUP_BONUS = 10;
export const PREVIEW_PRICE = 3;

/**
 * 활동 보상 규칙 — 활동마다 1~2개, 활동별 일일 한도, 같은 대상에 대한 중복 보상 금지.
 * refKey 는 "같은 활동"을 구분하는 키 (예: 회차 ID). (user,type,refKey) 는 평생 1회만 보상.
 */
export const REWARD_RULES = {
  view_episode: { amount: 1, dailyCap: 5, label: '다른 작가의 웹툰 회차 감상', desc: '서로 다른 회차 1개당 1개 (하루 최대 5개)' },
  comment_episode: { amount: 1, dailyCap: 3, label: '웹툰 회차에 댓글 작성', desc: '서로 다른 회차에 5자 이상 댓글 1개당 1개 (하루 최대 3개)' },
  publish_episode: { amount: 2, dailyCap: 1, label: '웹툰 회차 연재', desc: '새 회차 공개 시 2개 (하루 1회)' },
  publish_illustration: { amount: 1, dailyCap: 1, label: '그림 업로드', desc: '새 그림 공개 시 1개 (하루 1회)' },
  like_illustration: { amount: 1, dailyCap: 2, label: '다른 작가 그림에 좋아요', desc: '서로 다른 그림 1개당 1개 (하루 최대 2개)' },
  profile_complete: { amount: 2, dailyCap: 1, label: '프로필 완성', desc: '프로필 사진과 자기소개를 모두 등록하면 1회 2개' },
};
export const ATTENDANCE_RULE = { amount: 1, streakBonusEvery: 7, streakBonusAmount: 2, desc: '하루 1회 1개, 7일 연속 출석마다 그날은 2개' };

async function ensureWallet(userId) {
  return CookieWallet.findOneAndUpdate(
    { user: userId },
    { $setOnInsert: { user: userId, balance: 0 } },
    { upsert: true, returnDocument: 'after' }
  );
}

export async function getWallet(userId) {
  return ensureWallet(userId);
}

/**
 * 쿠키 지급(원자적). idempotencyKey 가 주어지면 같은 키로는 단 한 번만 지급된다.
 * @returns {Promise<{tx, wallet}|null>} 이미 처리된 키면 null
 */
export async function credit(userId, amount, type, { reason = '', rewardType = '', ref, idempotencyKey } = {}) {
  if (!Number.isInteger(amount) || amount <= 0) throw new Error('credit amount must be positive integer');
  await ensureWallet(userId);

  // 1) 멱등 키로 거래 기록을 먼저 선점 → 동시 요청이 와도 하나만 성공
  let tx;
  try {
    tx = await CookieTransaction.create({ user: userId, type, amount, reason, rewardType, ref, idempotencyKey });
  } catch (e) {
    if (isDupKey(e)) return null;
    throw e;
  }
  // 2) 잔액 증가 ($inc 는 단일 문서 원자 연산)
  const inc = { balance: amount };
  if (type === 'receive') inc.totalReceived = amount;
  else inc.totalEarned = amount;
  try {
    const wallet = await CookieWallet.findOneAndUpdate({ user: userId }, { $inc: inc }, { returnDocument: 'after' });
    tx.balanceAfter = wallet.balance;
    await tx.save();
    return { tx, wallet };
  } catch (e) {
    await CookieTransaction.deleteOne({ _id: tx._id }).catch(() => {});
    throw e;
  }
}

/**
 * 쿠키 차감(원자적). 잔액이 부족하면 차감하지 않고 402 에러.
 * 관리자는 쿠키가 무제한이므로 차감 없이 기록만 남긴다.
 */
export async function debit(user, amount, { reason = '', ref, idempotencyKey } = {}) {
  if (!Number.isInteger(amount) || amount <= 0) throw new Error('debit amount must be positive integer');
  if (user.role === 'admin') {
    const tx = await CookieTransaction.create({ user: user._id, type: 'spend', amount: -amount, balanceAfter: null, reason: `${reason} (관리자 무제한)`, ref, idempotencyKey });
    return { tx, wallet: null };
  }
  await ensureWallet(user._id);
  const wallet = await CookieWallet.findOneAndUpdate(
    { user: user._id, balance: { $gte: amount } },
    { $inc: { balance: -amount, totalSpent: amount } },
    { returnDocument: 'after' }
  );
  if (!wallet) throw new HttpError(402, `쿠키가 부족합니다. (필요: ${amount}개)`, 'INSUFFICIENT_COOKIES');
  try {
    const tx = await CookieTransaction.create({ user: user._id, type: 'spend', amount: -amount, balanceAfter: wallet.balance, reason, ref, idempotencyKey });
    return { tx, wallet };
  } catch (e) {
    // 기록 실패 시 차감 되돌리기
    await CookieWallet.updateOne({ user: user._id }, { $inc: { balance: amount, totalSpent: -amount } });
    if (isDupKey(e)) return null;
    throw e;
  }
}

export async function grantSignupBonus(userId) {
  return credit(userId, SIGNUP_BONUS, 'signup', { reason: '회원가입 축하 쿠키', idempotencyKey: `signup:${userId}` });
}

/**
 * 활동 보상 지급. 중복/한도 초과면 null.
 * @returns {Promise<{amount:number, type:string, label:string}|null>}
 */
export async function grantReward(user, type, refKey) {
  const rule = REWARD_RULES[type];
  if (!rule || !user || user.role === 'admin') return null;
  const userId = user._id;
  const day = kstDay();

  // 1) 같은 대상에 대한 보상은 평생 1회
  let log;
  try {
    log = await RewardLog.create({ user: userId, type, refKey: String(refKey), day, amount: rule.amount });
  } catch (e) {
    if (isDupKey(e)) return null;
    throw e;
  }

  // 2) 일일 한도: 조건부 증가 (count < cap 인 경우에만 +1). 한도에 도달했으면 upsert 가 중복키로 실패한다.
  try {
    const counter = await DailyRewardCounter.findOneAndUpdate(
      { user: userId, type, day, count: { $lt: rule.dailyCap } },
      { $inc: { count: 1 }, $setOnInsert: { createdAt: new Date() } },
      { upsert: true, returnDocument: 'after' }
    );
    if (!counter) throw Object.assign(new Error('cap'), { code: 11000 });
  } catch (e) {
    await RewardLog.deleteOne({ _id: log._id }); // 내일 다시 받을 수 있도록 선점 해제
    if (isDupKey(e)) return null;
    throw e;
  }

  // 3) 지급
  const r = await credit(userId, rule.amount, 'reward', {
    reason: rule.label,
    rewardType: type,
    idempotencyKey: `reward:${userId}:${type}:${refKey}`,
  });
  if (!r) return null;
  return { amount: rule.amount, type, label: rule.label, balance: r.wallet.balance };
}

/** 출석체크 (KST 하루 1회) */
export async function checkAttendance(user) {
  const day = kstDay();
  const yesterday = kstDayOffset(-1);
  const prev = await Attendance.findOne({ user: user._id, day: yesterday }).lean();
  const streak = prev ? prev.streak + 1 : 1;
  const reward = streak % ATTENDANCE_RULE.streakBonusEvery === 0 ? ATTENDANCE_RULE.streakBonusAmount : ATTENDANCE_RULE.amount;
  let att;
  try {
    att = await Attendance.create({ user: user._id, day, streak, reward: user.role === 'admin' ? 0 : reward });
  } catch (e) {
    if (isDupKey(e)) throw new HttpError(409, '오늘은 이미 출석체크를 했어요. 내일 다시 와 주세요!', 'ALREADY_CHECKED');
    throw e;
  }
  let balance = null;
  if (user.role !== 'admin') {
    const r = await credit(user._id, reward, 'reward', {
      reason: streak % ATTENDANCE_RULE.streakBonusEvery === 0 ? `출석체크 (${streak}일 연속 보너스)` : `출석체크 (${streak}일 연속)`,
      rewardType: 'attendance',
      idempotencyKey: `attendance:${user._id}:${day}`,
    });
    balance = r?.wallet.balance ?? null;
  }
  return { day, streak: att.streak, reward: att.reward, balance };
}

/** 관리자가 사용자에게 쿠키 선물 → 수신자 수신함에 '미수령' 상태로 들어간다 */
export async function sendGift(admin, recipient, amount, message = '') {
  const item = await CookieInbox.create({ recipient: recipient._id, sender: admin._id, amount, message });
  // 관리자 측 기록 (무제한이므로 잔액 차감 없음)
  await CookieTransaction.create({
    user: admin._id,
    type: 'admin_adjust',
    amount: 0,
    balanceAfter: null,
    reason: `${recipient.nickname}(@${recipient.username})님에게 쿠키 ${amount}개 선물 (관리자 무제한)`,
    ref: { kind: 'inbox', id: item._id },
  });
  await notify(recipient._id, {
    type: 'cookie_gift',
    title: `관리자에게 쿠키 ${amount}개를 받았어요 🍪`,
    body: message ? `“${message}” — 수신함에서 수령하세요.` : '수신함에서 수령하면 보유 쿠키에 반영됩니다.',
    link: '/inbox',
    actor: admin._id,
  });
  return item;
}

/** 수신함 쿠키 수령 — 원자적으로 claimed 를 뒤집은 요청만 지급 (중복 수령 불가) */
export async function claimGift(user, inboxId) {
  const item = await CookieInbox.findOneAndUpdate(
    { _id: inboxId, recipient: user._id, claimed: false },
    { $set: { claimed: true, claimedAt: new Date() } },
    { returnDocument: 'after' }
  ).populate('sender', 'nickname username');
  if (!item) throw new HttpError(409, '이미 수령했거나 존재하지 않는 선물입니다.', 'ALREADY_CLAIMED');
  if (user.role === 'admin') return { item, balance: null };
  try {
    const r = await credit(user._id, item.amount, 'receive', {
      reason: `관리자 쿠키 선물 수령${item.message ? ` — ${item.message}` : ''}`,
      ref: { kind: 'inbox', id: item._id },
      idempotencyKey: `inbox:${item._id}`,
    });
    return { item, balance: r?.wallet.balance ?? (await getWallet(user._id)).balance };
  } catch (e) {
    await CookieInbox.updateOne({ _id: item._id }, { $set: { claimed: false, claimedAt: null } });
    throw e;
  }
}

/**
 * 예약 회차 미리보기 구매 (쿠키 3개). 이미 구매했다면 차감하지 않는다.
 * 구매 기록(유니크 인덱스)을 먼저 선점하므로 동시 요청이 와도 한 번만 차감된다.
 */
export async function purchasePreview(user, episode) {
  const existing = await EpisodePurchase.findOne({ user: user._id, episode: episode._id }).lean();
  if (existing) return { alreadyOwned: true, purchase: existing, balance: null };

  let purchase;
  try {
    purchase = await EpisodePurchase.create({ user: user._id, episode: episode._id, price: PREVIEW_PRICE });
  } catch (e) {
    if (isDupKey(e)) return { alreadyOwned: true, balance: null };
    throw e;
  }
  try {
    const r = await debit(user, PREVIEW_PRICE, {
      reason: `예약 회차 미리보기: ${episode.number}화 ${episode.title}`,
      ref: { kind: 'episode', id: episode._id },
      idempotencyKey: `preview:${user._id}:${episode._id}`,
    });
    return { alreadyOwned: false, purchase, balance: r?.wallet ? r.wallet.balance : null };
  } catch (e) {
    await EpisodePurchase.deleteOne({ _id: purchase._id });
    throw e;
  }
}

export async function ownsPreview(userId, episodeId) {
  if (!userId) return false;
  return !!(await EpisodePurchase.exists({ user: userId, episode: episodeId }));
}

export async function walletSummary(user) {
  const w = await getWallet(user._id);
  return {
    unlimited: user.role === 'admin',
    balance: user.role === 'admin' ? null : w.balance,
    totalEarned: w.totalEarned,
    totalSpent: w.totalSpent,
    totalReceived: w.totalReceived,
  };
}

export async function adminAdjust(admin, targetUser, amount, reason) {
  // 관리자 직접 조정(회수 포함) — 음수면 잔액 이상 차감 불가
  if (amount > 0) {
    return credit(targetUser._id, amount, 'admin_adjust', { reason: reason || '관리자 지급', ref: { kind: 'user', id: admin._id } });
  }
  const abs = -amount;
  const wallet = await CookieWallet.findOneAndUpdate(
    { user: targetUser._id, balance: { $gte: abs } },
    { $inc: { balance: -abs } },
    { returnDocument: 'after' }
  );
  if (!wallet) throw new HttpError(400, '회수할 쿠키가 보유량보다 많습니다.');
  const tx = await CookieTransaction.create({ user: targetUser._id, type: 'admin_adjust', amount: -abs, balanceAfter: wallet.balance, reason: reason || '관리자 회수', ref: { kind: 'user', id: admin._id } });
  return { tx, wallet };
}

