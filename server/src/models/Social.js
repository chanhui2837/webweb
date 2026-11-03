import mongoose from 'mongoose';

const { Schema } = mongoose;

/* ---------------- Comments ---------------- */
const commentSchema = new Schema(
  {
    author: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    targetType: { type: String, enum: ['episode', 'illustration'], required: true },
    target: { type: Schema.Types.ObjectId, required: true },
    // 알림/관리용: 대상 작품의 작가
    targetOwner: { type: Schema.Types.ObjectId, ref: 'User' },
    content: { type: String, required: true, maxlength: 1000 },
    hidden: { type: Boolean, default: false },
  },
  { timestamps: true, collection: 'comments' }
);
commentSchema.index({ targetType: 1, target: 1, createdAt: -1 });
commentSchema.index({ author: 1, createdAt: -1 });
commentSchema.index({ createdAt: -1 });

/* ---------------- Likes (사용자별 1회) ---------------- */
const likeSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    targetType: { type: String, enum: ['webtoon', 'episode', 'illustration'], required: true },
    target: { type: Schema.Types.ObjectId, required: true },
  },
  { timestamps: true, collection: 'likes' }
);
likeSchema.index({ user: 1, targetType: 1, target: 1 }, { unique: true });
likeSchema.index({ targetType: 1, target: 1 });

/* ---------------- Bookmarks (관심 웹툰 / 저장한 그림) ---------------- */
const bookmarkSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    targetType: { type: String, enum: ['webtoon', 'illustration'], required: true },
    target: { type: Schema.Types.ObjectId, required: true },
  },
  { timestamps: true, collection: 'bookmarks' }
);
bookmarkSchema.index({ user: 1, targetType: 1, target: 1 }, { unique: true });
bookmarkSchema.index({ user: 1, targetType: 1, createdAt: -1 });
bookmarkSchema.index({ targetType: 1, target: 1 });

/* ---------------- Reports (부적절한 콘텐츠 신고) ---------------- */
const reportSchema = new Schema(
  {
    reporter: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    targetType: { type: String, enum: ['webtoon', 'episode', 'illustration', 'comment', 'user'], required: true },
    target: { type: Schema.Types.ObjectId, required: true },
    reason: { type: String, required: true, maxlength: 500 },
    status: { type: String, enum: ['open', 'resolved', 'dismissed'], default: 'open' },
    resolvedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    resolution: { type: String, default: '' },
  },
  { timestamps: true, collection: 'reports' }
);
reportSchema.index({ status: 1, createdAt: -1 });
reportSchema.index({ reporter: 1, targetType: 1, target: 1 }, { unique: true });

/* ---------------- ViewLogs (조회수 중복 방지, 2일 뒤 자동 삭제) ---------------- */
const viewLogSchema = new Schema(
  {
    key: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
  },
  { collection: 'viewlogs' }
);
viewLogSchema.index({ key: 1 }, { unique: true });
viewLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 48 });

export const Comment = mongoose.models.Comment || mongoose.model('Comment', commentSchema);
export const Like = mongoose.models.Like || mongoose.model('Like', likeSchema);
export const Bookmark = mongoose.models.Bookmark || mongoose.model('Bookmark', bookmarkSchema);
export const Report = mongoose.models.Report || mongoose.model('Report', reportSchema);
export const ViewLog = mongoose.models.ViewLog || mongoose.model('ViewLog', viewLogSchema);
