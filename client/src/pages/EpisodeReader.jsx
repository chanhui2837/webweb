import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { epLabel, fmtDate, fmtNum, untilText } from '../lib/format.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { Avatar, Empty, Icon, Spinner } from '../components/ui.jsx';
import Comments from '../components/Comments.jsx';
import ReportButton from '../components/ReportButton.jsx';

export default function EpisodeReader() {
  const { id } = useParams();
  const { user, wallet, refresh } = useAuth();
  const toast = useToast();
  const nav = useNavigate();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [bar, setBar] = useState(true);

  async function load() {
    try {
      const r = await api.get(`/episodes/${id}`);
      setData(r);
      if (r.reward) { toast.reward(r.reward); refresh(); }
    } catch (e) { setError(e.message); }
  }
  useEffect(() => { setData(null); setError(''); load(); }, [id, user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // 스크롤 내리면 상단바 숨김 (웹툰 몰입 감상)
  useEffect(() => {
    let last = window.scrollY;
    const onScroll = () => { const y = window.scrollY; setBar(y < last || y < 80); last = y; };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  async function purchase() {
    if (!user) { nav(`/login?next=/episodes/${id}`); return; }
    setBusy(true);
    try {
      await api.post(`/episodes/${id}/purchase`);
      toast.cookie('쿠키 3개로 미리보기를 열었어요!');
      await refresh();
      await load();
    } catch (e) { toast.error(e); } finally { setBusy(false); }
  }

  async function toggleLike() {
    if (!user) { nav(`/login?next=/episodes/${id}`); return; }
    try {
      const r = await api.post('/likes', { targetType: 'episode', targetId: id, like: !data.viewer.liked });
      setData({ ...data, viewer: { ...data.viewer, liked: r.liked }, episode: { ...data.episode, likeCount: r.likeCount } });
    } catch (e) { toast.error(e); }
  }

  if (error) return <div className="page"><Empty title={error} action={<Link className="btn" to="/webtoons">웹툰 목록으로</Link>} /></div>;
  if (!data) return <Spinner />;
  const { episode: ep, webtoon: w, prev, next } = data;

  const navBtns = (
    <div className="reader-nav">
      {prev ? <Link className="btn" to={`/episodes/${prev.id}`}><Icon name="chevronL" size={16} /> 이전화</Link> : <span className="btn disabled" aria-disabled="true"><Icon name="chevronL" size={16} /> 이전화</span>}
      <Link className="btn btn-ghost" to={`/webtoons/${w.id}`}>목록</Link>
      {next ? <Link className="btn" to={`/episodes/${next.id}`}>다음화 <Icon name="chevronR" size={16} /></Link> : <span className="btn disabled" aria-disabled="true">다음화 <Icon name="chevronR" size={16} /></span>}
    </div>
  );

  return (
    <div className="reader">
      <div className={`reader-bar ${bar ? '' : 'hide'}`}>
        <Link to={`/webtoons/${w.id}`} className="icon-btn" aria-label="작품으로"><Icon name="chevronL" /></Link>
        <div className="reader-title">
          <span>{w.title}</span>
          <strong>{epLabel(ep)}</strong>
        </div>
        {next ? <Link to={`/episodes/${next.id}`} className="icon-btn" aria-label="다음화"><Icon name="chevronR" /></Link> : <span className="icon-btn" />}
      </div>

      {data.locked ? (
        <div className="lock-panel">
          <div className="lock-ico"><Icon name="lock" size={34} /></div>
          <h1>{epLabel(ep)}</h1>
          <p><strong>{untilText(ep.publishAt)}</strong> · {fmtDate(ep.publishAt, true)} (한국 시간) 무료 공개 예정</p>
          <p className="muted">쿠키 {data.previewPrice}개로 지금 바로 미리 볼 수 있어요. 한 번 구매하면 다시 차감되지 않아요.</p>
          <button type="button" className="btn btn-primary btn-lg" onClick={purchase} disabled={busy}>
            쿠키 {data.previewPrice}개로 미리보기
          </button>
          {user && wallet && !wallet.unlimited && (
            <p className="muted">보유 쿠키 {wallet.balance}개{wallet.balance < data.previewPrice && <> · <Link to="/cookies">쿠키 모으는 방법</Link></>}</p>
          )}
          {navBtns}
        </div>
      ) : (
        <>
          {data.access === 'purchased' && <p className="preview-flag">쿠키로 연 미리보기 회차예요</p>}
          {data.access === 'owner' && ep.status !== 'published' && <p className="preview-flag">작가 미리보기 — 아직 독자에게 공개되지 않았어요</p>}
          <div className="strip">
            {data.pages.map((p) => (
              <img key={p.id} src={p.imageUrl} alt="" width={p.width} height={p.height} loading="lazy" style={p.width && p.height ? { aspectRatio: `${p.width} / ${p.height}` } : undefined} />
            ))}
          </div>
          <div className="reader-foot">
            <div className="reader-author">
              <Link to={`/u/${w.author.username}`}><Avatar user={w.author} size={44} /></Link>
              <div>
                <Link to={`/u/${w.author.username}`} className="author-link">{w.author.nickname}</Link>
                {ep.authorNote ? <p className="author-note">{ep.authorNote}</p> : <p className="muted">작가의 말이 없어요.</p>}
              </div>
            </div>
            <div className="reader-actions">
              <button type="button" className={`btn btn-lg ${data.viewer?.liked ? 'btn-like-on' : ''}`} onClick={toggleLike} aria-pressed={!!data.viewer?.liked}>
                <Icon name="heart" /> {fmtNum(ep.likeCount)}
              </button>
              <span className="muted"><Icon name="eye" size={14} /> {fmtNum(ep.viewCount)}</span>
              {user && !data.viewer?.isOwner && <ReportButton targetType="episode" targetId={ep.id} />}
            </div>
            {navBtns}
            <Comments targetType="episode" targetId={ep.id} />
          </div>
        </>
      )}
    </div>
  );
}
