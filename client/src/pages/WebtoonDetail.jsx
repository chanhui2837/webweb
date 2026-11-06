import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { epLabel, fmtDate, fmtNum, untilText } from '../lib/format.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { Avatar, Empty, Icon, Spinner, WebtoonBanner } from '../components/ui.jsx';
import ReportButton from '../components/ReportButton.jsx';

export default function WebtoonDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const toast = useToast();
  const nav = useNavigate();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [order, setOrder] = useState('desc');

  useEffect(() => {
    setData(null);
    api.get(`/webtoons/${id}`).then(setData).catch((e) => setError(e.message));
  }, [id, user?.id]);

  const needLogin = () => { nav(`/login?next=/webtoons/${id}`); };

  async function toggleBookmark() {
    if (!user) return needLogin();
    try {
      const r = await api.post('/bookmarks', { targetType: 'webtoon', targetId: id, bookmark: !data.viewer.bookmarked });
      setData({ ...data, viewer: { ...data.viewer, bookmarked: r.bookmarked }, webtoon: { ...data.webtoon, bookmarkCount: r.bookmarkCount } });
      toast.success(r.bookmarked ? '관심 웹툰에 추가했어요. 새 회차가 올라오면 알려 드릴게요.' : '관심 웹툰에서 뺐어요.');
    } catch (e) { toast.error(e); }
  }
  async function toggleLike() {
    if (!user) return needLogin();
    try {
      const r = await api.post('/likes', { targetType: 'webtoon', targetId: id, like: !data.viewer.liked });
      setData({ ...data, viewer: { ...data.viewer, liked: r.liked }, webtoon: { ...data.webtoon, likeCount: r.likeCount } });
    } catch (e) { toast.error(e); }
  }

  if (error) return <div className="page"><Empty title={error} action={<Link className="btn" to="/webtoons">웹툰 목록으로</Link>} /></div>;
  if (!data) return <Spinner />;
  const { webtoon: w, episodes, viewer } = data;
  const list = order === 'desc' ? [...episodes].reverse() : episodes;
  const firstPublic = episodes.find((e) => e.status === 'published');

  return (
    <div className="page">
      <WebtoonBanner w={w} tagline={w.genre}>
        <Link to={`/u/${w.author.username}`} className="wt-banner-author">{w.author.nickname}</Link>
        <p className="wt-banner-stats">
          <span><Icon name="heart" size={13} /> {fmtNum(w.likeCount)}</span>
          <span>· 관심 {fmtNum(w.bookmarkCount)}</span>
        </p>
      </WebtoonBanner>

      <section className="wt-under">
        <div className="wt-main-actions">
          <button type="button" className={`btn btn-lg ${viewer.bookmarked ? 'btn-on' : ''}`} onClick={toggleBookmark} aria-pressed={viewer.bookmarked}>
            <Icon name="bookmark" size={16} /> {viewer.bookmarked ? '관심 웹툰' : '관심 등록'}
          </button>
          {firstPublic
            ? <Link className="btn btn-lg btn-primary" to={`/episodes/${firstPublic.id}`}>첫 화 보기</Link>
            : <span className="btn btn-lg btn-primary is-disabled" aria-disabled="true">공개된 회차 없음</span>}
        </div>
        <div className="wt-info">
          <Link to={`/u/${w.author.username}`} className="wt-author"><Avatar user={w.author} size={28} /> {w.author.nickname}</Link>
          {w.description && <p className="wt-desc">{w.description}</p>}
          <div className="wt-stats">
            <span><Icon name="eye" size={15} /> 조회 {fmtNum(w.viewCount)}</span>
            <span><Icon name="heart" size={15} /> 좋아요 {fmtNum(w.likeCount)}</span>
            <span><Icon name="bookmark" size={15} /> 관심 {fmtNum(w.bookmarkCount)}</span>
          </div>
          <div className="wt-actions">
            <button type="button" className={`btn btn-sm ${viewer.liked ? 'btn-like-on' : ''}`} onClick={toggleLike} aria-pressed={viewer.liked}>
              <Icon name="heart" size={15} /> {viewer.liked ? '좋아요 취소' : '좋아요'}
            </button>
            {viewer.isOwner && <Link className="btn btn-sm" to={`/projects/webtoons/${w.id}`}><Icon name="edit" size={15} /> 작품 관리</Link>}
            {user && !viewer.isOwner && <ReportButton targetType="webtoon" targetId={w.id} />}
          </div>
        </div>
      </section>

      <section className="ep-section">
        <div className="section-head">
          <h2>회차 <span className="muted">{episodes.length}</span></h2>
          <div className="seg seg-sm">
            <button type="button" className={order === 'desc' ? 'on' : ''} onClick={() => setOrder('desc')}>최신화부터</button>
            <button type="button" className={order === 'asc' ? 'on' : ''} onClick={() => setOrder('asc')}>1화부터</button>
          </div>
        </div>
        {episodes.length === 0 && <Empty title="아직 공개된 회차가 없어요" />}
        <ul className="ep-list">
          {list.map((e) => (
            <li key={e.id}>
              <Link to={`/episodes/${e.id}`} className={`ep-row ${e.status === 'scheduled' ? 'locked' : ''}`}>
                <div className="ep-thumb">{e.thumbnailUrl ? <img src={e.thumbnailUrl} alt="" loading="lazy" /> : <span>{e.number}</span>}</div>
                <div className="ep-main">
                  <strong>{epLabel(e)}</strong>
                  <span className="muted">
                    {e.status === 'scheduled'
                      ? <><Icon name="lock" size={13} /> {untilText(e.publishAt)} ({fmtDate(e.publishAt, true)}) · 쿠키 3개로 미리보기</>
                      : <>{fmtDate(e.publishedAt)} · 조회 {fmtNum(e.viewCount)} · 좋아요 {fmtNum(e.likeCount)}</>}
                  </span>
                </div>
                <Icon name="chevronR" />
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
