import { Episode, ScheduledUpload, User, Webtoon } from '../models/index.js';
import { grantReward } from './cookieService.js';
import { notifyNewEpisode } from './notificationService.js';

/** 회차가 "공개됨" 상태로 막 전환되었을 때의 후처리 (카운터, 알림, 연재 보상) */
async function afterPublished(episode) {
  const webtoon = await Webtoon.findByIdAndUpdate(
    episode.webtoon,
    {
      $inc: { publishedEpisodeCount: 1 },
      $max: { lastEpisodeAt: episode.publishedAt },
      ...(episode.thumbnailUrl ? { $set: { autoThumbnailUrl: episode.thumbnailUrl } } : {}),
    },
    { returnDocument: 'after' }
  );
  if (!webtoon) return;
  if (webtoon.visibility === 'public' && !webtoon.hidden) {
    await notifyNewEpisode(webtoon, episode).catch((e) => console.warn('[publish] 알림 실패', e.message));
  }
  const claimed = await Episode.findOneAndUpdate({ _id: episode._id, publishRewarded: false }, { $set: { publishRewarded: true } });
  if (claimed) {
    const author = await User.findById(episode.author);
    if (author) await grantReward(author, 'publish_episode', episode._id.toString()).catch(() => null);
  }
}

/** 임시저장/예약 상태의 회차를 즉시 공개 */
export async function publishNow(episodeId) {
  const now = new Date();
  const ep = await Episode.findOneAndUpdate(
    { _id: episodeId, status: { $in: ['draft', 'scheduled'] } },
    { $set: { status: 'published', publishedAt: now, publishAt: null } },
    { returnDocument: 'after' }
  );
  if (!ep) return null;
  await ScheduledUpload.updateMany({ episode: ep._id, status: 'pending' }, { $set: { status: 'cancelled', processedAt: now } });
  await afterPublished(ep);
  return ep;
}

/** 예약 업로드 등록/변경 (publishAt: UTC Date) */
export async function schedule(episode, publishAt) {
  await ScheduledUpload.updateMany({ episode: episode._id, status: 'pending' }, { $set: { status: 'cancelled', processedAt: new Date() } });
  const ep = await Episode.findOneAndUpdate(
    { _id: episode._id, status: { $in: ['draft', 'scheduled'] } },
    { $set: { status: 'scheduled', publishAt } },
    { returnDocument: 'after' }
  );
  if (!ep) return null;
  await ScheduledUpload.create({ episode: ep._id, webtoon: ep.webtoon, author: ep.author, publishAt });
  return ep;
}

/** 예약 취소 → 임시저장으로 되돌림 */
export async function cancelSchedule(episode) {
  const ep = await Episode.findOneAndUpdate(
    { _id: episode._id, status: 'scheduled' },
    { $set: { status: 'draft', publishAt: null } },
    { returnDocument: 'after' }
  );
  await ScheduledUpload.updateMany({ episode: episode._id, status: 'pending' }, { $set: { status: 'cancelled', processedAt: new Date() } });
  return ep;
}

/**
 * 예약 시간이 지난 회차를 공개 처리. 서버가 꺼져 있던 동안 지난 예약도 재시작 시 처리된다.
 * findOneAndUpdate 조건부 전환이라 여러 인스턴스가 동시에 돌아도 한 번만 처리된다.
 */
export async function processDueSchedules() {
  const now = new Date();
  let processed = 0;
  const due = await ScheduledUpload.find({ status: 'pending', publishAt: { $lte: now } }).sort({ publishAt: 1 }).limit(200);
  for (const job of due) {
    try {
      const ep = await Episode.findOneAndUpdate(
        { _id: job.episode, status: 'scheduled', publishAt: { $lte: now } },
        { $set: { status: 'published', publishedAt: job.publishAt, publishAt: null } },
        { returnDocument: 'after' }
      );
      await ScheduledUpload.updateOne({ _id: job._id, status: 'pending' }, { $set: { status: ep ? 'done' : 'cancelled', processedAt: new Date() } });
      if (ep) {
        processed += 1;
        await afterPublished(ep);
      }
    } catch (e) {
      console.error('[scheduler] 처리 실패', job._id.toString(), e.message);
      await ScheduledUpload.updateOne({ _id: job._id }, { $set: { lastError: e.message } });
    }
  }
  // ScheduledUploads 기록이 없는 예약 회차(데이터 이전 등)도 안전하게 처리
  const orphans = await Episode.find({ status: 'scheduled', publishAt: { $lte: now } }).limit(100);
  for (const o of orphans) {
    const ep = await Episode.findOneAndUpdate(
      { _id: o._id, status: 'scheduled' },
      { $set: { status: 'published', publishedAt: o.publishAt || now, publishAt: null } },
      { returnDocument: 'after' }
    );
    if (ep) {
      processed += 1;
      await afterPublished(ep);
    }
  }
  return processed;
}

let timer = null;
export function startScheduler(intervalMs = 30000) {
  if (timer) return;
  const run = () => processDueSchedules()
    .then((n) => { if (n) console.log(`[scheduler] 예약 회차 ${n}개 공개 처리`); })
    .catch((e) => console.error('[scheduler]', e.message));
  run();
  timer = setInterval(run, intervalMs);
  timer.unref?.();
}
export function stopScheduler() {
  if (timer) clearInterval(timer);
  timer = null;
}

/**
 * 회차 감상 가능 여부 판단.
 * - published: 누구나 (단, 웹툰이 비공개/숨김이면 작가·관리자만)
 * - scheduled: 작가·관리자 또는 쿠키로 미리보기 구매한 사용자
 * - draft: 작가·관리자만
 */
export function episodeAccess(ep, webtoon, user, owned) {
  const isOwner = user && String(user._id) === String(ep.author);
  const isAdminUser = user && user.role === 'admin';
  if (isOwner || isAdminUser) return { canView: true, reason: 'owner' };
  if (ep.hidden || webtoon.hidden || webtoon.visibility !== 'public') return { canView: false, reason: 'private' };
  if (ep.status === 'published') return { canView: true, reason: 'public' };
  if (ep.status === 'scheduled') return owned ? { canView: true, reason: 'purchased' } : { canView: false, reason: 'scheduled' };
  return { canView: false, reason: 'draft' };
}
