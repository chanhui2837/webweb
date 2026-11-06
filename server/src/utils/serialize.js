export const AUTHOR_FIELDS = 'username nickname avatarUrl';

export function authorOf(a) {
  if (!a) return null;
  if (!a.nickname) return { id: String(a._id || a), username: '', nickname: '(알 수 없음)', avatarUrl: '' };
  return { id: String(a._id), username: a.username, nickname: a.nickname, avatarUrl: a.avatarUrl || '' };
}

export function webtoonCard(w, extra = {}) {
  return {
    id: String(w._id),
    title: w.title,
    genre: w.genre,
    description: w.description,
    coverUrl: w.coverUrl,
    autoThumbnailUrl: w.autoThumbnailUrl || '',
    ownThumbnailUrl: w.thumbnailUrl || '', // 작가가 직접 올린 썸네일 (관리 화면용)
    thumbnailUrl: w.thumbnailUrl || w.coverUrl || w.autoThumbnailUrl || '',
    bannerColor: w.bannerColor || '',
    visibility: w.visibility,
    hidden: !!w.hidden,
    author: authorOf(w.author),
    viewCount: w.viewCount,
    likeCount: w.likeCount,
    bookmarkCount: w.bookmarkCount,
    publishedEpisodeCount: w.publishedEpisodeCount,
    lastEpisodeAt: w.lastEpisodeAt,
    createdAt: w.createdAt,
    updatedAt: w.updatedAt,
    ...extra,
  };
}

export function episodeSummary(e) {
  return {
    id: String(e._id),
    webtoonId: String(e.webtoon?._id || e.webtoon),
    number: e.number,
    title: e.title,
    thumbnailUrl: e.thumbnailUrl || e.pages?.[0]?.imageUrl || '',
    status: e.status,
    publishAt: e.publishAt,
    publishedAt: e.publishedAt,
    pageCount: e.pages?.length || 0,
    viewCount: e.viewCount,
    likeCount: e.likeCount,
    commentCount: e.commentCount,
    hidden: !!e.hidden,
    createdAt: e.createdAt,
    updatedAt: e.updatedAt,
  };
}

export function illustrationCard(i, extra = {}) {
  return {
    id: String(i._id),
    title: i.title,
    description: i.description,
    tags: i.tags,
    imageUrl: i.imageUrl,
    width: i.width,
    height: i.height,
    status: i.status,
    visibility: i.visibility,
    hidden: !!i.hidden,
    author: authorOf(i.author),
    viewCount: i.viewCount,
    likeCount: i.likeCount,
    bookmarkCount: i.bookmarkCount,
    commentCount: i.commentCount,
    publishedAt: i.publishedAt,
    createdAt: i.createdAt,
    updatedAt: i.updatedAt,
    ...extra,
  };
}

export function commentOut(c, viewer) {
  return {
    id: String(c._id),
    content: c.hidden ? '관리자에 의해 숨겨진 댓글입니다.' : c.content,
    hidden: !!c.hidden,
    author: authorOf(c.author),
    createdAt: c.createdAt,
    canDelete: !!viewer && (viewer.role === 'admin' || String(viewer._id) === String(c.author?._id || c.author)),
  };
}
