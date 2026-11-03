import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api, qs } from '../lib/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { Avatar, Empty, Icon, Pager, Spinner, TimeAgo } from '../components/ui.jsx';

const TYPE_ICON = { new_episode: 'book', like: 'heart', comment: 'chat', cookie_gift: 'cookie', reward: 'cookie', system: 'bell', moderation: 'shield' };

function Gifts() {
  const { refresh, refreshUnread } = useAuth();
  const toast = useToast();
  const [data, setData] = useState(null);
  const [page, setPage] = useState(1);
  const load = useCallback(() => api.get(`/inbox${qs({ page })}`).then(setData).catch((e) => toast.error(e)), [page, toast]);
  useEffect(() => { load(); }, [load]);

  async function claim(id) {
    try {
      const r = await api.post(`/inbox/${id}/claim`);
      toast.cookie(`쿠키 ${r.amount}개를 받았어요! 🍪`);
      await Promise.all([load(), refresh(), refreshUnread()]);
    } catch (e) { toast.error(e); load(); }
  }
  async function claimAll() {
    try {
      const r = await api.post('/inbox/claim-all');
      toast.cookie(`쿠키 ${r.amount}개를 한 번에 받았어요!`);
      await Promise.all([load(), refresh(), refreshUnread()]);
    } catch (e) { toast.error(e); }
  }

  if (!data) return <Spinner />;
  return (
    <>
      <div className="list-tools">
        <span className="muted">받지 않은 선물 {data.unclaimed}개</span>
        {data.unclaimed > 1 && <button type="button" className="btn btn-primary btn-sm" onClick={claimAll}>모두 받기</button>}
      </div>
      {data.items.length === 0 && <Empty title="받은 쿠키 선물이 없어요">관리자가 쿠키를 보내면 여기에서 받을 수 있어요.</Empty>}
      <ul className="gift-list">
        {data.items.map((g) => (
          <li key={g.id} className={g.claimed ? 'claimed' : ''}>
            <span className="gift-cookie" aria-hidden="true">🍪</span>
            <div className="gift-main">
              <strong>쿠키 {g.amount.toLocaleString()}개</strong>
              <span className="muted">{g.sender?.nickname} 보냄 · <TimeAgo date={g.createdAt} /></span>
              {g.message && <p>“{g.message}”</p>}
            </div>
            {g.claimed ? <span className="muted">수령 완료</span> : <button type="button" className="btn btn-primary" onClick={() => claim(g.id)}>받기</button>}
          </li>
        ))}
      </ul>
      <Pager page={data.page} pages={data.pages} onPage={setPage} />
    </>
  );
}

function Notifications() {
  const { refreshUnread } = useAuth();
  const toast = useToast();
  const nav = useNavigate();
  const [data, setData] = useState(null);
  const [page, setPage] = useState(1);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const load = useCallback(() => api.get(`/notifications${qs({ page, unread: unreadOnly ? 'true' : '' })}`).then(setData).catch((e) => toast.error(e)), [page, unreadOnly, toast]);
  useEffect(() => { load(); }, [load]);

  async function open(n) {
    if (!n.read) { await api.post(`/notifications/${n.id}/read`, { read: true }).catch(() => {}); refreshUnread(); }
    if (n.link) nav(n.link); else load();
  }
  async function toggleRead(n) {
    await api.post(`/notifications/${n.id}/read`, { read: !n.read }).catch((e) => toast.error(e));
    load(); refreshUnread();
  }
  async function remove(n) {
    await api.del(`/notifications/${n.id}`).catch((e) => toast.error(e));
    load(); refreshUnread();
  }
  async function readAll() {
    await api.post('/notifications/read-all');
    load(); refreshUnread();
  }

  if (!data) return <Spinner />;
  return (
    <>
      <div className="list-tools">
        <label className="ed-check"><input type="checkbox" checked={unreadOnly} onChange={(e) => { setUnreadOnly(e.target.checked); setPage(1); }} /> 읽지 않은 알림만</label>
        <button type="button" className="btn btn-sm" onClick={readAll}>모두 읽음 처리</button>
      </div>
      {data.items.length === 0 && <Empty title={unreadOnly ? '읽지 않은 알림이 없어요' : '아직 알림이 없어요'}>관심 웹툰의 새 회차, 내 작품의 좋아요·댓글 소식이 여기에 와요.</Empty>}
      <ul className="noti-list">
        {data.items.map((n) => (
          <li key={n.id} className={n.read ? 'read' : 'unread'}>
            <button type="button" className="noti-main" onClick={() => open(n)}>
              {n.actor ? <Avatar user={n.actor} size={38} /> : <span className="noti-ico"><Icon name={TYPE_ICON[n.type] || 'bell'} /></span>}
              <span className="noti-text">
                <strong>{n.title}</strong>
                {n.body && <span>{n.body}</span>}
                <TimeAgo date={n.createdAt} />
              </span>
              {!n.read && <span className="unread-dot" aria-label="읽지 않음" />}
            </button>
            <div className="noti-actions">
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => toggleRead(n)}>{n.read ? '안 읽음으로' : '읽음'}</button>
              <button type="button" className="icon-btn" onClick={() => remove(n)} aria-label="알림 삭제"><Icon name="trash" size={16} /></button>
            </div>
          </li>
        ))}
      </ul>
      <Pager page={data.page} pages={data.pages} onPage={setPage} />
    </>
  );
}

export default function Inbox() {
  const [sp, setSp] = useSearchParams();
  const { unread } = useAuth();
  const tab = sp.get('tab') === 'gifts' ? 'gifts' : 'notifications';
  useEffect(() => {
    if (!sp.get('tab') && unread.gifts > 0) setSp({ tab: 'gifts' }, { replace: true });
  }, [unread.gifts]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="page page-narrow">
      <div className="page-head"><h1>수신함</h1><Link to="/cookies" className="btn btn-ghost">쿠키 내역 보기</Link></div>
      <div className="tabs tabs-line">
        <button type="button" className={tab === 'notifications' ? 'on' : ''} onClick={() => setSp({})}>알림 {unread.notifications > 0 && <span className="badge inline">{unread.notifications}</span>}</button>
        <button type="button" className={tab === 'gifts' ? 'on' : ''} onClick={() => setSp({ tab: 'gifts' })}>쿠키 선물 {unread.gifts > 0 && <span className="badge inline">{unread.gifts}</span>}</button>
      </div>
      {tab === 'notifications' ? <Notifications /> : <Gifts />}
    </div>
  );
}
