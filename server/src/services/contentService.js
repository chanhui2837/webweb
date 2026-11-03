import crypto from 'node:crypto';
import {
  Bookmark,
  Comment,
  Episode,
  EpisodePurchase,
  Illustration,
  Like,
  Report,
  ScheduledUpload,
  ViewLog,
  Webtoon,
} from '../models/index.js';
import { isDupKey } from '../utils/http.js';
import { deleteEditorDocs } from './editorDocService.js';
import { kstDay } from '../utils/time.js';

/** 조회수 중복 방지: 같은 사용자(또는 IP)가 같은 작품을 하루에 여러 번 봐도 1회만 집계 */
export async function registerView(req, kind, id) {
  const viewer = req.user ? `u:${req.user._id}` : `ip:${crypto.createHash('sha256').update(String(req.ip)).digest('hex').slice(0, 16)}`;
  try {
    await ViewLog.create({ key: `${kind}:${id}:${viewer}:${kstDay()}` });
    return true;
  } catch (e) {
    if (isDupKey(e)) return false;
    throw e;
  }
}

export async function deleteEpisodeCascade(ep) {
  const wasPublished = ep.status === 'published';
  const docIds = ep.pages.map((p) => p.editorDoc).filter(Boolean);
  await Promise.all([
    deleteEditorDocs(docIds),
    Comment.deleteMany({ targetType: 'episode', target: ep._id }),
    Like.deleteMany({ targetType: 'episode', target: ep._id }),
    ScheduledUpload.updateMany({ episode: ep._id, status: 'pending' }, { $set: { status: 'cancelled', processedAt: new Date() } }),
    Report.deleteMany({ targetType: 'episode', target: ep._id }),
  ]);
  await Episode.deleteOne({ _id: ep._id });
  if (wasPublished) {
    await Webtoon.updateOne({ _id: ep.webtoon }, { $inc: { publishedEpisodeCount: -1, commentCount: -(ep.commentCount || 0) } });
    // 마지막 업데이트 시각 재계산
    const last = await Episode.findOne({ webtoon: ep.webtoon, status: 'published' }).sort({ publishedAt: -1 }).select('publishedAt').lean();
    await Webtoon.updateOne({ _id: ep.webtoon }, { $set: { lastEpisodeAt: last?.publishedAt || null } });
  }
}

export async function deleteWebtoonCascade(webtoon) {
  const eps = await Episode.find({ webtoon: webtoon._id }).select('_id pages').lean();
  const epIds = eps.map((e) => e._id);
  const docIds = eps.flatMap((e) => e.pages.map((p) => p.editorDoc)).filter(Boolean);
  await Promise.all([
    deleteEditorDocs(docIds),
    Comment.deleteMany({ targetType: 'episode', target: { $in: epIds } }),
    Like.deleteMany({ $or: [{ targetType: 'episode', target: { $in: epIds } }, { targetType: 'webtoon', target: webtoon._id }] }),
    Bookmark.deleteMany({ targetType: 'webtoon', target: webtoon._id }),
    ScheduledUpload.updateMany({ webtoon: webtoon._id, status: 'pending' }, { $set: { status: 'cancelled', processedAt: new Date() } }),
    EpisodePurchase.deleteMany({ episode: { $in: epIds } }),
    Report.deleteMany({ $or: [{ targetType: 'webtoon', target: webtoon._id }, { targetType: 'episode', target: { $in: epIds } }] }),
  ]);
  await Episode.deleteMany({ webtoon: webtoon._id });
  await Webtoon.deleteOne({ _id: webtoon._id });
}

export async function deleteIllustrationCascade(ill) {
  await Promise.all([
    ill.editorDoc ? deleteEditorDocs([ill.editorDoc]) : null,
    Comment.deleteMany({ targetType: 'illustration', target: ill._id }),
    Like.deleteMany({ targetType: 'illustration', target: ill._id }),
    Bookmark.deleteMany({ targetType: 'illustration', target: ill._id }),
    Report.deleteMany({ targetType: 'illustration', target: ill._id }),
  ]);
  await Illustration.deleteOne({ _id: ill._id });
}

/** 댓글 삭제 시 대상의 댓글 수 감소 */
export async function deleteCommentCascade(c) {
  await Comment.deleteOne({ _id: c._id });
  if (c.targetType === 'episode') {
    const ep = await Episode.findByIdAndUpdate(c.target, { $inc: { commentCount: -1 } });
    if (ep) await Webtoon.updateOne({ _id: ep.webtoon }, { $inc: { commentCount: -1 } });
  } else {
    await Illustration.updateOne({ _id: c.target }, { $inc: { commentCount: -1 } });
  }
  await Report.deleteMany({ targetType: 'comment', target: c._id });
}
