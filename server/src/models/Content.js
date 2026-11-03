import mongoose from 'mongoose';

const { Schema } = mongoose;

export const GENRES = ['판타지', '액션', '일상', '로맨스', '코미디', '공포', '미스터리', '드라마', 'SF', '기타'];

/* ---------------- Webtoons ---------------- */
const webtoonSchema = new Schema(
  {
    author: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, required: true, trim: true, maxlength: 60 },
    genre: { type: String, enum: GENRES, required: true },
    description: { type: String, default: '', maxlength: 2000 },
    coverUrl: { type: String, default: '' },
    thumbnailUrl: { type: String, default: '' },
    // 표지/썸네일이 없을 때 쓰는 최신 회차 썸네일 (자동)
    autoThumbnailUrl: { type: String, default: '' },
    visibility: { type: String, enum: ['public', 'private'], default: 'private' },
    hidden: { type: Boolean, default: false }, // 관리자 숨김 처리
    hiddenReason: { type: String, default: '' },
    viewCount: { type: Number, default: 0 },
    likeCount: { type: Number, default: 0 },
    bookmarkCount: { type: Number, default: 0 },
    commentCount: { type: Number, default: 0 },
    publishedEpisodeCount: { type: Number, default: 0 },
    episodeSeq: { type: Number, default: 0 }, // 회차 번호 발급용
    lastEpisodeAt: { type: Date, default: null },
  },
  { timestamps: true, collection: 'webtoons' }
);
webtoonSchema.index({ author: 1, createdAt: -1 });
webtoonSchema.index({ visibility: 1, hidden: 1, publishedEpisodeCount: 1, createdAt: -1 });
webtoonSchema.index({ visibility: 1, hidden: 1, lastEpisodeAt: -1 });
webtoonSchema.index({ genre: 1, likeCount: -1 });
webtoonSchema.index({ viewCount: -1 });
webtoonSchema.index({ likeCount: -1 });

/* ---------------- Episodes ---------------- */
const pageSchema = new Schema(
  {
    editorDoc: { type: Schema.Types.ObjectId, ref: 'EditorDoc' },
    imageUrl: { type: String, default: '' }, // 업로드(렌더링)된 최종 이미지
    width: Number,
    height: Number,
  },
  { _id: true }
);

const episodeSchema = new Schema(
  {
    webtoon: { type: Schema.Types.ObjectId, ref: 'Webtoon', required: true },
    author: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    number: { type: Number, required: true },
    title: { type: String, required: true, trim: true, maxlength: 80 },
    authorNote: { type: String, default: '', maxlength: 500 },
    thumbnailUrl: { type: String, default: '' },
    pages: { type: [pageSchema], default: [] },
    // draft: 임시저장 / scheduled: 예약 / published: 공개
    status: { type: String, enum: ['draft', 'scheduled', 'published'], default: 'draft' },
    publishAt: { type: Date, default: null }, // UTC 저장
    publishedAt: { type: Date, default: null },
    hidden: { type: Boolean, default: false },
    viewCount: { type: Number, default: 0 },
    likeCount: { type: Number, default: 0 },
    commentCount: { type: Number, default: 0 },
    publishRewarded: { type: Boolean, default: false },
  },
  { timestamps: true, collection: 'episodes' }
);
episodeSchema.index({ webtoon: 1, number: 1 }, { unique: true });
episodeSchema.index({ webtoon: 1, status: 1, publishedAt: 1 });
episodeSchema.index({ status: 1, publishAt: 1 });
episodeSchema.index({ author: 1, updatedAt: -1 });

/* ---------------- Illustrations ---------------- */
const illustrationSchema = new Schema(
  {
    author: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, required: true, trim: true, maxlength: 60 },
    description: { type: String, default: '', maxlength: 2000 },
    tags: { type: [String], default: [] },
    editorDoc: { type: Schema.Types.ObjectId, ref: 'EditorDoc' },
    imageUrl: { type: String, default: '' },
    width: Number,
    height: Number,
    status: { type: String, enum: ['draft', 'published'], default: 'draft' },
    visibility: { type: String, enum: ['public', 'private'], default: 'public' },
    hidden: { type: Boolean, default: false },
    hiddenReason: { type: String, default: '' },
    publishedAt: { type: Date, default: null },
    viewCount: { type: Number, default: 0 },
    likeCount: { type: Number, default: 0 },
    bookmarkCount: { type: Number, default: 0 },
    commentCount: { type: Number, default: 0 },
    publishRewarded: { type: Boolean, default: false },
  },
  { timestamps: true, collection: 'illustrations' }
);
illustrationSchema.index({ author: 1, updatedAt: -1 });
illustrationSchema.index({ status: 1, visibility: 1, hidden: 1, publishedAt: -1 });
illustrationSchema.index({ status: 1, visibility: 1, hidden: 1, likeCount: -1 });

/* ---------------- EditorDocs (편집기 원본 데이터) ---------------- */
const editorDocSchema = new Schema(
  {
    owner: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    kind: { type: String, enum: ['episodePage', 'illustration'], required: true },
    data: { type: Schema.Types.Mixed, default: null }, // 레이어/아이템 JSON
    byteSize: { type: Number, default: 0 },
  },
  { timestamps: true, collection: 'editordocs', minimize: false }
);
editorDocSchema.index({ owner: 1 });

export const Webtoon = mongoose.models.Webtoon || mongoose.model('Webtoon', webtoonSchema);
export const Episode = mongoose.models.Episode || mongoose.model('Episode', episodeSchema);
export const Illustration = mongoose.models.Illustration || mongoose.model('Illustration', illustrationSchema);
export const EditorDoc = mongoose.models.EditorDoc || mongoose.model('EditorDoc', editorDocSchema);
