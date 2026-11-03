import mongoose from 'mongoose';

const { Schema } = mongoose;

/* ---------------- Notifications ---------------- */
const notificationSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    type: {
      type: String,
      enum: ['new_episode', 'like', 'comment', 'cookie_gift', 'reward', 'system', 'moderation'],
      required: true,
    },
    title: { type: String, required: true, maxlength: 120 },
    body: { type: String, default: '', maxlength: 300 },
    link: { type: String, default: '' }, // 프론트 라우트 경로
    actor: { type: Schema.Types.ObjectId, ref: 'User' },
    read: { type: Boolean, default: false },
    // 같은 이벤트 알림 중복 방지 (예: 같은 사람이 좋아요 취소→재클릭)
    dedupeKey: { type: String },
  },
  { timestamps: true, collection: 'notifications' }
);
notificationSchema.index({ user: 1, read: 1, createdAt: -1 });
notificationSchema.index({ user: 1, createdAt: -1 });
notificationSchema.index({ dedupeKey: 1 }, { unique: true, partialFilterExpression: { dedupeKey: { $type: 'string' } } });
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 180 });

/* ---------------- ScheduledUploads (예약 업로드 작업) ---------------- */
const scheduledSchema = new Schema(
  {
    episode: { type: Schema.Types.ObjectId, ref: 'Episode', required: true },
    webtoon: { type: Schema.Types.ObjectId, ref: 'Webtoon', required: true },
    author: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    publishAt: { type: Date, required: true }, // UTC
    status: { type: String, enum: ['pending', 'done', 'cancelled'], default: 'pending' },
    processedAt: { type: Date, default: null },
    lastError: { type: String, default: '' },
  },
  { timestamps: true, collection: 'scheduleduploads' }
);
scheduledSchema.index({ status: 1, publishAt: 1 });
scheduledSchema.index({ episode: 1 }, { unique: true, partialFilterExpression: { status: 'pending' } });

/* ---------------- VerificationCodes (아이디/비밀번호 찾기 본인확인) ---------------- */
const verificationSchema = new Schema(
  {
    purpose: { type: String, enum: ['find_id', 'reset_password'], required: true },
    channel: { type: String, enum: ['email', 'phone'], required: true },
    target: { type: String, required: true }, // 정규화된 이메일/전화번호
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    codeHash: { type: String, required: true },
    attempts: { type: Number, default: 0 },
    verified: { type: Boolean, default: false },
    resetTokenHash: { type: String, default: '' },
    used: { type: Boolean, default: false },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true, collection: 'verificationcodes' }
);
verificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
verificationSchema.index({ purpose: 1, target: 1, createdAt: -1 });

export const Notification = mongoose.models.Notification || mongoose.model('Notification', notificationSchema);
export const ScheduledUpload = mongoose.models.ScheduledUpload || mongoose.model('ScheduledUpload', scheduledSchema);
export const VerificationCode = mongoose.models.VerificationCode || mongoose.model('VerificationCode', verificationSchema);
