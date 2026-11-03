import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { api, qs } from '../lib/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { Avatar, Icon, Pager, TimeAgo } from './ui.jsx';
import ReportButton from './ReportButton.jsx';

export default function Comments({ targetType, targetId, onCountChange }) {
  const { user, refresh } = useAuth();
  const toast = useToast();
  const loc = useLocation();
  const [data, setData] = useState({ items: [], total: 0, page: 1, pages: 1 });
  const [page, setPage] = useState(1);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await api.get(`/comments${qs({ targetType, targetId, page })}`));
    } catch (e) {
      toast.error(e);
    }
  }, [targetType, targetId, page, toast]);
  useEffect(() => { load(); }, [load]);

  async function submit(e) {
    e.preventDefault();
    if (!text.trim()) return;
    setBusy(true);
    try {
      const r = await api.post('/comments', { targetType, targetId, content: text });
      setText('');
      if (r.reward) { toast.reward(r.reward); refresh(); }
      if (page !== 1) setPage(1); else await load();
      onCountChange?.(1);
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(false);
    }
  }

  async function remove(id) {
    if (!window.confirm('댓글을 삭제할까요?')) return;
    try {
      await api.del(`/comments/${id}`);
      await load();
      onCountChange?.(-1);
    } catch (err) {
      toast.error(err);
    }
  }

  return (
    <section className="comments" id="comments">
      <h3>댓글 <span className="muted">{data.total}</span></h3>
      {user ? (
        <form className="comment-form" onSubmit={submit}>
          <Avatar user={user} size={34} />
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={1000}
            rows={2}
            placeholder="작가에게 응원의 한마디를 남겨 주세요"
            aria-label="댓글 입력"
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) submit(e); }}
          />
          <button type="submit" className="btn btn-primary" disabled={busy || !text.trim()}>등록</button>
        </form>
      ) : (
        <p className="comment-login"><Link to={`/login?next=${encodeURIComponent(loc.pathname)}`}>로그인</Link>하고 댓글을 남겨 보세요.</p>
      )}
      <ul className="comment-list">
        {data.items.map((c) => (
          <li key={c.id} className={c.hidden ? 'is-hidden' : ''}>
            <Link to={`/u/${c.author?.username}`}><Avatar user={c.author} size={34} /></Link>
            <div className="comment-body">
              <div className="comment-meta">
                <Link to={`/u/${c.author?.username}`} className="author-link">{c.author?.nickname}</Link>
                <TimeAgo date={c.createdAt} />
              </div>
              <p>{c.content}</p>
            </div>
            <div className="comment-actions">
              {c.canDelete && <button type="button" className="icon-btn" onClick={() => remove(c.id)} aria-label="댓글 삭제"><Icon name="trash" size={16} /></button>}
              {user && !c.canDelete && <ReportButton targetType="comment" targetId={c.id} compact />}
            </div>
          </li>
        ))}
      </ul>
      {data.total === 0 && <p className="muted center">첫 댓글을 남겨 보세요.</p>}
      <Pager page={data.page} pages={data.pages} onPage={setPage} />
    </section>
  );
}
