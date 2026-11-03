import mongoose from 'mongoose';

const { Schema } = mongoose;

/* ---------------- Cookies (사용자별 쿠키 지갑) ---------------- */
const walletSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    balance: { type: Number, default: 0, min: 0 },
    totalEarned: { type: Number, default: 0 },
    totalSpent: { type: Number, default: 0 },
    totalReceived: { type: Number, default: 0 },
  },
  { timestamps: true, collection: 'cookies' }
);
walletSchema.index({ user: 1 }, { unique: true });

/* ---------------- CookieTransactions (모든 변동 내역) ---------------- */
export const TX_TYPES = ['signup', 'reward', 'spend', 'receive', 'admin_adjust', 'refund'];
const txSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: TX_TYPES, required: true },
    amount: { type: Number, required: true }, // +획득 / -사용
    balanceAfter: { type: Number }, // 관리자(무제한)는 null
    reason: { type: String, default: '' },
    rewardType: { type: String, default: '' },
    ref: {
      kind: { type: String, default: '' },
      id: { type: Schema.Types.ObjectId },
    },
    // 동일 지급/차감의 중복 처리를 막는 멱등 키
    idempotencyKey: { type: String },
  },
  { timestamps: true, collection: 'cookietransactions' }
);
txSchema.index({ user: 1, createdAt: -1 });
txSchema.index({ user: 1, type: 1, createdAt: -1 });
txSchema.index({ idempotencyKey: 1 }, { unique: true, partialFilterExpression: { idempotencyKey: { $type: 'string' } } });

/* ---------------- CookieInbox (관리자 쿠키 선물 수신함) ---------------- */
const inboxSchema = new Schema(
  {
    recipient: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    sender: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    amount: { type: Number, required: true, min: 1 },
    message: { type: String, default: '', maxlength: 200 },
    claimed: { type: Boolean, default: false },
    claimedAt: { type: Date, default: null },
  },
  { timestamps: true, collection: 'cookieinbox' }
);
inboxSchema.index({ recipient: 1, claimed: 1, createdAt: -1 });

/* ---------------- EpisodePurchases (예약 회차 미리보기 구매) ---------------- */
const purchaseSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    episode: { type: Schema.Types.ObjectId, ref: 'Episode', required: true },
    price: { type: Number, required: true },
  },
  { timestamps: true, collection: 'episodepurchases' }
);
purchaseSchema.index({ user: 1, episode: 1 }, { unique: true });

/* ---------------- RewardLogs (활동 보상 중복 방지) ---------------- */
const rewardLogSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, required: true },
    refKey: { type: String, required: true },
    day: { type: String, required: true }, // KST YYYY-MM-DD
    amount: { type: Number, required: true },
  },
  { timestamps: true, collection: 'rewardlogs' }
);
rewardLogSchema.index({ user: 1, type: 1, refKey: 1 }, { unique: true });
rewardLogSchema.index({ user: 1, day: 1 });

/* ---------------- DailyRewardCounters (활동별 일일 한도) ---------------- */
const counterSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, required: true },
    type: { type: String, required: true },
    day: { type: String, required: true },
    count: { type: Number, default: 0 },
    createdAt: { type: Date, default: Date.now },
  },
  { collection: 'dailyrewardcounters' }
);
counterSchema.index({ user: 1, type: 1, day: 1 }, { unique: true });
counterSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 7 });

/* ---------------- Attendance (출석체크) ---------------- */
const attendanceSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    day: { type: String, required: true }, // KST YYYY-MM-DD
    streak: { type: Number, default: 1 },
    reward: { type: Number, default: 1 },
  },
  { timestamps: true, collection: 'attendance' }
);
attendanceSchema.index({ user: 1, day: 1 }, { unique: true });
attendanceSchema.index({ user: 1, createdAt: -1 });

export const CookieWallet = mongoose.models.CookieWallet || mongoose.model('CookieWallet', walletSchema);
export const CookieTransaction = mongoose.models.CookieTransaction || mongoose.model('CookieTransaction', txSchema);
export const CookieInbox = mongoose.models.CookieInbox || mongoose.model('CookieInbox', inboxSchema);
export const EpisodePurchase = mongoose.models.EpisodePurchase || mongoose.model('EpisodePurchase', purchaseSchema);
export const RewardLog = mongoose.models.RewardLog || mongoose.model('RewardLog', rewardLogSchema);
export const DailyRewardCounter = mongoose.models.DailyRewardCounter || mongoose.model('DailyRewardCounter', counterSchema);
export const Attendance = mongoose.models.Attendance || mongoose.model('Attendance', attendanceSchema);
