import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { fmtDate, fmtNum } from '../lib/format.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { Avatar, Empty, IllustCard, Icon, Spinner } from '../components/ui.jsx';
import Comments from '../components/Comments.jsx';
import ReportButton from '../components/ReportButton.jsx';

export default function IllustrationDetail() {
  const { id } = useParams();
  const { user, refresh } = useAuth();
  const toast = useToast();
  const nav = useNavigate();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    setData(null);
    api.get(`/illustrations/${id}`).then(setData).catch((e) => setError(e.message));
  }, [id, user?.id]);

  const login = () => nav(`/login?next=/illustrations/${id}`);

  async function like() {
    if (!user) return login();
    try {
      const r = await api.post('/likes', { targetType: 'illustration', targetId: id, like: !data.viewer.liked });
      setData({ ...data, viewer: { ...data.viewer, liked: r.liked }, illustration: { ...data.illustration, likeCount: r.likeCount } });
      if (r.reward) { toast.reward(r.reward); refresh(); }
    } catch (e) { toast.error(e); }
  }
  async function save() {
    if (!user) return login();
    try {
      const r = await api.post('/bookmarks', { targetType: 'illustration', targetId: id, bookmark: !data.viewer.saved });
      setData({ ...data, viewer: { ...data.viewer, saved: r.bookmarked }, illustration: { ...data.illustration, bookmarkCount: r.bookmarkCount } });
      toast.success(r.bookmarked ? '저장한 그림에 담았어요.' : '저장을 취소했어요.');
    } catch (e) { toast.error(e); }
  }

  if (error) return <div className="page"><Empty title={error} action={<Link className="btn" to="/illustrations">그림 목록으로</Link>} /></div>;
  if (!data) return <Spinner />;
  const { illustration: i, viewer, moreByAuthor } = data;

  return (
    <div className="page">
      <div className="ill-layout">
        <figure className="ill-stage">
          {i.imageUrl ? <img src={i.imageUrl} alt={i.title} /> : <div className="thumb-empty big">아직 이미지가 없어요</div>}
        </figure>
        <aside className="ill-side">
          {(i.hidden || i.status !== 'published' || i.visibility !== 'public') && (
            <p className="notice notice-warn">{i.hidden ? '관리자에 의해 숨김 처리된 그림이에요.' : '나만 볼 수 있는 그림이에요.'}</p>
          )}
          <h1>{i.title}</h1>
          <Link to={`/u/${i.author.username}`} className="wt-author"><Avatar user={i.author} size={32} /> {i.author.nickname}</Link>
          {i.description && <p className="wt-desc">{i.description}</p>}
          {i.tags?.length > 0 && (
            <div className="tags">{i.tags.map((t) => <Link key={t} to={`/illustrations?q=${encodeURIComponent(t)}`}>#{t}</Link>)}</div>
          )}
          <div className="wt-stats">
            <span><Icon name="eye" size={15} /> {fmtNum(i.viewCount)}</span>
            <span><Icon name="heart" size={15} /> {fmtNum(i.likeCount)}</span>
            <span><Icon name="bookmark" size={15} /> {fmtNum(i.bookmarkCount)}</span>
            {i.publishedAt && <span>{fmtDate(i.publishedAt)}</span>}
          </div>
          <div className="wt-actions">
            <button type="button" className={`btn ${viewer.liked ? 'btn-like-on' : ''}`} onClick={like} aria-pressed={viewer.liked}><Icon name="heart" size={16} /> 좋아요</button>
            <button type="button" className={`btn ${viewer.saved ? 'btn-on' : ''}`} onClick={save} aria-pressed={viewer.saved}><Icon name="bookmark" size={16} /> {viewer.saved ? '저장됨' : '저장'}</button>
            {viewer.isOwner && <Link className="btn" to={`/projects/illustrations/${i.id}`}><Icon name="edit" size={16} /> 편집</Link>}
            {user && !viewer.isOwner && <ReportButton targetType="illustration" targetId={i.id} />}
          </div>
          <Comments targetType="illustration" targetId={i.id} />
        </aside>
      </div>
      {moreByAuthor.length > 0 && (
        <section className="section">
          <div className="section-head"><h2>{i.author.nickname}님의 다른 그림</h2><Link className="section-more" to={`/u/${i.author.username}`}>더 보기</Link></div>
          <div className="masonry">{moreByAuthor.map((x) => <IllustCard key={x.id} i={x} />)}</div>
        </section>
      )}
    </div>
  );
}
