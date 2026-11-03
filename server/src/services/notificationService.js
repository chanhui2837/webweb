import { Bookmark, Notification } from '../models/index.js';
import { isDupKey } from '../utils/http.js';

/** 단일 알림 생성. dedupeKey 가 같으면 중복 생성하지 않는다. 실패해도 본 기능을 막지 않음. */
export async function notify(userId, { type, title, body = '', link = '', actor, dedupeKey }) {
  if (!userId) return null;
  if (actor && String(actor) === String(userId) && type !== 'reward' && type !== 'system') return null; // 자기 자신 행동은 알림 X
  try {
    return await Notification.create({ user: userId, type, title, body, link, actor, dedupeKey });
  } catch (e) {
    if (!isDupKey(e)) console.warn('[notify] 실패:', e.message);
    return null;
  }
}

/** 웹툰을 관심 등록한 모든 사용자에게 새 회차 알림 */
export async function notifyNewEpisode(webtoon, episode) {
  const cursor = Bookmark.find({ targetType: 'webtoon', target: webtoon._id }).select('user').lean().cursor();
  let batch = [];
  const flush = async () => {
    if (!batch.length) return;
    await Notification.insertMany(batch, { ordered: false }).catch((e) => {
      if (!isDupKey(e) && !e.writeErrors) console.warn('[notify] 새 회차 알림 실패:', e.message);
    });
    batch = [];
  };
  for await (const b of cursor) {
    if (String(b.user) === String(webtoon.author)) continue;
    batch.push({
      user: b.user,
      type: 'new_episode',
      title: `「${webtoon.title}」 새 회차가 올라왔어요`,
      body: `${episode.number}화 ${episode.title}`,
      link: `/episodes/${episode._id}`,
      actor: webtoon.author,
      dedupeKey: `new_episode:${episode._id}:${b.user}`,
    });
    if (batch.length >= 500) await flush();
  }
  await flush();
}
