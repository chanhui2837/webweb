import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, qs } from '../lib/api.js';
import { fmtDate, fmtNum } from '../lib/format.js';
import { useToast } from '../context/ToastContext.jsx';
import { Avatar, EpisodeStatus, Field, Icon, Modal, Pager, Spinner } from '../components/ui.jsx';

function useList(url, params) {
  const toast = useToast();
  const [data, setData] = useState(null);
  const key = JSON.stringify(params);
  const load = useCallback(() => api.get(`${url}${qs(params)}`).then(setData).catch((e) => toast.error(e)), [url, key]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [load]);
  return [data, load];
}

function SearchBox({ onSearch, placeholder }) {
  const [v, setV] = useState('');
  return (
    <form className="searchbar" onSubmit={(e) => { e.preventDefault(); onSearch(v.trim()); }} role="search">
      <input value={v} onChange={(e) => setV(e.target.value)} placeholder={placeholder} aria-label={placeholder} />
      <button type="submit" aria-label="검색"><Icon name="search" /></button>
    </form>
  );
}

function Dashboard({ go }) {
  const [s] = useList('/admin/stats', {});
  if (!s) return <Spinner />;
  const cards = [
    ['전체 회원', s.users, 'users'], ['24시간 신규 가입', s.newUsers, 'users'], ['정지된 계정', s.suspended, 'users'],
    ['웹툰', s.webtoons, 'webtoons'], ['공개 회차', s.episodes, 'webtoons'], ['공개 그림', s.illustrations, 'illustrations'],
    ['댓글', s.comments, 'comments'], ['처리 대기 신고', s.openReports, 'reports'],
  ];
  return (
    <div className="stat-grid">
      {cards.map(([l, v, t]) => (
        <button type="button" key={l} className={`stat ${t === 'reports' && v > 0 ? 'alert' : ''}`} onClick={() => go(t)}>
          <span>{l}</span><strong>{fmtNum(v)}</strong>
        </button>
      ))}
    </div>
  );
}

function CookieSend() {
  const toast = useToast();
  const [q, setQ] = useState('');
  const [found, setFound] = useState([]);
  const [target, setTarget] = useState(null);
  const [amount, setAmount] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [gifts, loadGifts] = useList('/admin/cookies/gifts', {});

  useEffect(() => {
    if (!q.trim()) { setFound([]); return undefined; }
    const t = setTimeout(() => api.get(`/admin/cookies/find-user${qs({ username: q.trim() })}`).then((r) => setFound(r.items)).catch(() => {}), 250);
    return () => clearTimeout(t);
  }, [q]);

  async function send(e) {
    e.preventDefault();
    const n = Number(amount);
    if (!target) { toast.error('받을 사용자를 검색해서 선택해 주세요.'); return; }
    if (!Number.isInteger(n) || n < 1) { toast.error('지급할 쿠키를 1 이상의 정수로 입력해 주세요.'); return; }
    if (!window.confirm(`${target.nickname}(@${target.username})님에게 쿠키 ${n.toLocaleString()}개를 보낼까요?`)) return;
    setBusy(true);
    try {
      const r = await api.post('/admin/cookies/send', { username: target.username, amount: n, message });
      toast.success(r.message);
      setAmount(''); setMessage(''); setTarget(null); setQ('');
      loadGifts();
    } catch (err) { toast.error(err); } finally { setBusy(false); }
  }

  return (
    <div className="admin-two">
      <form className="panel" onSubmit={send}>
        <h2>쿠키 보내기</h2>
        <p className="muted small">관리자 쿠키는 무제한이라 보내도 줄지 않아요. 받은 사람은 수신함에서 ‘받기’를 눌러야 보유 쿠키에 반영돼요.</p>
        <Field label="1. 받을 사용자 아이디 검색" htmlFor="cs-q">
          <input id="cs-q" className="input" value={q} onChange={(e) => { setQ(e.target.value); setTarget(null); }} placeholder="아이디 앞부분 입력" autoComplete="off" />
        </Field>
        {!target && found.length > 0 && (
          <ul className="pick-list">
            {found.map((u) => (
              <li key={u.id}><button type="button" onClick={() => { setTarget(u); setQ(u.username); }}><Avatar user={u} size={28} /> <strong>{u.username}</strong> <span className="muted">{u.nickname}{u.status === 'suspended' ? ' · 정지됨' : ''}</span></button></li>
            ))}
          </ul>
        )}
        {target && <p className="picked"><Avatar user={target} size={28} /> <strong>{target.nickname}</strong> @{target.username} 선택됨</p>}
        <Field label="2. 지급할 쿠키 수량" htmlFor="cs-a"><input id="cs-a" type="number" min="1" max="100000" className="input" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
        <Field label="메시지 (선택)" htmlFor="cs-m"><input id="cs-m" className="input" maxLength={200} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="예: 이벤트 당첨을 축하해요!" /></Field>
        <button type="submit" className="btn btn-primary btn-block" disabled={busy}>3. 전송</button>
      </form>
      <section className="panel">
        <h2>보낸 선물 내역</h2>
        {!gifts ? <Spinner /> : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>날짜</th><th>받는 사람</th><th className="num">쿠키</th><th>상태</th></tr></thead>
              <tbody>
                {gifts.items.map((g) => (
                  <tr key={g.id}><td>{fmtDate(g.createdAt, true)}</td><td>{g.recipient?.nickname} <span className="muted">@{g.recipient?.username}</span></td><td className="num">{g.amount.toLocaleString()}</td><td>{g.claimed ? <span className="ep-badge pub">수령</span> : <span className="ep-badge draft">미수령</span>}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function UserDetail({ id, onClose, onChanged }) {
  const toast = useToast();
  const [d, setD] = useState(null);
  const [adj, setAdj] = useState({ amount: '', reason: '' });
  const load = useCallback(() => api.get(`/admin/users/${id}`).then(setD).catch((e) => toast.error(e)), [id, toast]);
  useEffect(() => { load(); }, [load]);

  async function setStatus(status) {
    const reason = status === 'suspended' ? window.prompt('정지 사유를 입력하세요') : '';
    if (status === 'suspended' && reason === null) return;
    try { await api.post(`/admin/users/${id}/status`, { status, reason }); toast.success(status === 'suspended' ? '계정을 정지했어요.' : '정지를 해제했어요.'); load(); onChanged(); } catch (e) { toast.error(e); }
  }
  async function setRole(role) {
    if (!window.confirm(role === 'admin' ? '이 사용자에게 관리자 권한을 줄까요?' : '관리자 권한을 해제할까요?')) return;
    try { await api.post(`/admin/users/${id}/role`, { role }); load(); onChanged(); } catch (e) { toast.error(e); }
  }
  async function unlock() { try { await api.post(`/admin/users/${id}/unlock`); toast.success('로그인 잠금을 풀었어요.'); load(); } catch (e) { toast.error(e); } }
  async function adjust(e) {
    e.preventDefault();
    try { const r = await api.post('/admin/cookies/adjust', { userId: id, amount: Number(adj.amount), reason: adj.reason }); toast.success(`조정 완료 · 잔액 ${r.balance}개`); setAdj({ amount: '', reason: '' }); load(); } catch (err) { toast.error(err); }
  }

  return (
    <Modal open title="사용자 상세" onClose={onClose} wide>
      {!d ? <Spinner /> : (
        <div className="user-detail">
          <div className="profile-head small">
            <Avatar user={d.user} size={56} />
            <div>
              <h3>{d.user.nickname} <span className="muted">@{d.user.username}</span></h3>
              <p className="muted small">{d.user.email || '이메일 없음'} · {d.user.phone || '전화번호 없음'} · 가입 {fmtDate(d.user.createdAt)} · 최근 로그인 {d.user.lastLoginAt ? fmtDate(d.user.lastLoginAt, true) : '없음'}</p>
              <p className="small">
                {d.user.isAdmin ? <span className="ep-badge sch">관리자</span> : <span className="ep-badge pub">일반</span>}{' '}
                {d.user.status === 'suspended' ? <span className="ep-badge draft">정지됨 {d.user.suspendedReason && `(${d.user.suspendedReason})`}</span> : null}
                {' '}쿠키 {d.wallet.unlimited ? '무제한' : `${d.wallet.balance}개`}
              </p>
            </div>
          </div>
          <div className="row-gap wrap">
            {d.user.status === 'active' ? <button type="button" className="btn btn-danger btn-sm" onClick={() => setStatus('suspended')} disabled={d.user.isAdmin}>계정 정지</button> : <button type="button" className="btn btn-sm" onClick={() => setStatus('active')}>정지 해제</button>}
            {d.user.lockUntil && new Date(d.user.lockUntil) > new Date() && <button type="button" className="btn btn-sm" onClick={unlock}>로그인 잠금 해제</button>}
            {d.user.isAdmin ? <button type="button" className="btn btn-sm btn-ghost" onClick={() => setRole('user')}>관리자 해제</button> : <button type="button" className="btn btn-sm btn-ghost" onClick={() => setRole('admin')}>관리자 지정</button>}
            <Link className="btn btn-sm btn-ghost" to={`/u/${d.user.username}`}>공개 페이지</Link>
          </div>
          {!d.wallet.unlimited && (
            <form className="inline-form" onSubmit={adjust}>
              <input className="input" type="number" placeholder="+지급 / -회수" value={adj.amount} onChange={(e) => setAdj({ ...adj, amount: e.target.value })} />
              <input className="input" placeholder="사유 (필수)" value={adj.reason} onChange={(e) => setAdj({ ...adj, reason: e.target.value })} />
              <button type="submit" className="btn btn-sm" disabled={!adj.amount || !adj.reason}>쿠키 직접 조정</button>
            </form>
          )}
          <h4>웹툰 {d.webtoons.length}</h4>
          <ul className="mini-list">{d.webtoons.map((w) => <li key={w.id}><Link to={`/webtoons/${w.id}`}>{w.title}</Link> <span className="muted">{w.visibility === 'public' ? '공개' : '비공개'}{w.hidden ? ' · 숨김' : ''} · {w.publishedEpisodeCount}화</span></li>)}</ul>
          <h4>그림 {d.illustrations.length}</h4>
          <ul className="mini-list">{d.illustrations.map((i) => <li key={i.id}><Link to={`/illustrations/${i.id}`}>{i.title}</Link> <span className="muted">{i.status === 'published' ? '공개' : '임시저장'}{i.hidden ? ' · 숨김' : ''}</span></li>)}</ul>
          <h4>최근 댓글</h4>
          <ul className="mini-list">{d.comments.map((c) => <li key={c.id}>{c.content} <span className="muted">{fmtDate(c.createdAt, true)}</span></li>)}</ul>
          <h4>최근 쿠키 내역</h4>
          <ul className="mini-list">{d.transactions.map((t) => <li key={t.id}><strong className={t.amount < 0 ? 'neg' : 'pos'}>{t.amount > 0 ? '+' : ''}{t.amount}</strong> {t.reason} <span className="muted">{fmtDate(t.createdAt, true)}</span></li>)}</ul>
        </div>
      )}
    </Modal>
  );
}

function Users() {
  const [params, setParams] = useState({ q: '', status: '', page: 1 });
  const [data, load] = useList('/admin/users', params);
  const [detail, setDetail] = useState(null);
  return (
    <>
      <div className="list-tools">
        <SearchBox placeholder="아이디·닉네임·이메일·전화번호" onSearch={(q) => setParams({ ...params, q, page: 1 })} />
        <div className="seg seg-sm">
          {[['', '전체'], ['active', '정상'], ['suspended', '정지']].map(([v, l]) => <button type="button" key={v} className={params.status === v ? 'on' : ''} onClick={() => setParams({ ...params, status: v, page: 1 })}>{l}</button>)}
        </div>
      </div>
      {!data ? <Spinner /> : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>사용자</th><th>연락처</th><th>권한</th><th>상태</th><th>가입일</th><th /></tr></thead>
            <tbody>
              {data.items.map((u) => (
                <tr key={u.id}>
                  <td><span className="cell-user"><Avatar user={u} size={28} /> <strong>{u.username}</strong> <span className="muted">{u.nickname}</span></span></td>
                  <td className="small">{u.email || '—'}<br />{u.phone || ''}</td>
                  <td>{u.role === 'admin' ? '관리자' : '일반'}</td>
                  <td>{u.status === 'suspended' ? <span className="ep-badge draft">정지</span> : '정상'}</td>
                  <td>{fmtDate(u.createdAt)}</td>
                  <td><button type="button" className="btn btn-sm" onClick={() => setDetail(u.id)}>상세·관리</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {data && <Pager page={data.page} pages={data.pages} onPage={(p) => setParams({ ...params, page: p })} />}
      {detail && <UserDetail id={detail} onClose={() => setDetail(null)} onChanged={load} />}
    </>
  );
}

function ContentList({ kind }) {
  const toast = useToast();
  const [params, setParams] = useState({ q: '', hidden: '', page: 1 });
  const [data, load] = useList(`/admin/${kind}`, params);
  const [eps, setEps] = useState(null);

  async function hide(item, hidden) {
    const reason = hidden ? window.prompt('숨김 사유 (작가에게 알림으로 전달돼요)', '운영 정책 위반') : '';
    if (hidden && reason === null) return;
    try { await api.patch(`/admin/${kind}/${item.id}`, { hidden, reason }); toast.success(hidden ? '숨김 처리했어요.' : '숨김을 해제했어요.'); load(); } catch (e) { toast.error(e); }
  }
  async function remove(item) {
    if (!window.confirm(`「${item.title}」을(를) 영구 삭제할까요?`)) return;
    try { await api.del(`/admin/${kind}/${item.id}`); toast.success('삭제했어요.'); load(); } catch (e) { toast.error(e); }
  }
  async function showEpisodes(w) {
    try { const r = await api.get(`/admin/webtoons/${w.id}/episodes`); setEps({ webtoon: w, items: r.items }); } catch (e) { toast.error(e); }
  }
  async function epAction(ep, action) {
    try {
      if (action === 'delete') { if (!window.confirm('회차를 삭제할까요?')) return; await api.del(`/admin/episodes/${ep.id}`); }
      else await api.patch(`/admin/episodes/${ep.id}`, { hidden: action === 'hide' });
      showEpisodes(eps.webtoon);
    } catch (e) { toast.error(e); }
  }

  return (
    <>
      <div className="list-tools">
        <SearchBox placeholder="제목 검색" onSearch={(q) => setParams({ ...params, q, page: 1 })} />
        <label className="ed-check"><input type="checkbox" checked={params.hidden === 'true'} onChange={(e) => setParams({ ...params, hidden: e.target.checked ? 'true' : '', page: 1 })} /> 숨김 처리된 것만</label>
      </div>
      {!data ? <Spinner /> : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>작품</th><th>작가</th><th>상태</th><th className="num">조회/좋아요</th><th /></tr></thead>
            <tbody>
              {data.items.map((it) => (
                <tr key={it.id}>
                  <td><Link to={kind === 'webtoons' ? `/webtoons/${it.id}` : `/illustrations/${it.id}`}>{it.title}</Link>{kind === 'webtoons' && <span className="muted small"> · {it.genre} · {it.publishedEpisodeCount}화</span>}</td>
                  <td>{it.author?.nickname} <span className="muted small">@{it.author?.username}</span></td>
                  <td>{it.hidden ? <span className="ep-badge draft" title={it.hiddenReason}>숨김</span> : it.visibility === 'public' ? '공개' : '비공개'}</td>
                  <td className="num">{fmtNum(it.viewCount)} / {fmtNum(it.likeCount)}</td>
                  <td className="row-gap">
                    {kind === 'webtoons' && <button type="button" className="btn btn-sm btn-ghost" onClick={() => showEpisodes(it)}>회차</button>}
                    <button type="button" className="btn btn-sm" onClick={() => hide(it, !it.hidden)}>{it.hidden ? '숨김 해제' : '숨김'}</button>
                    <button type="button" className="icon-btn" onClick={() => remove(it)} aria-label="삭제"><Icon name="trash" size={16} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {data && <Pager page={data.page} pages={data.pages} onPage={(p) => setParams({ ...params, page: p })} />}
      <Modal open={!!eps} title={`「${eps?.webtoon.title}」 회차`} onClose={() => setEps(null)} wide>
        <ul className="mini-list">
          {eps?.items.map((e) => (
            <li key={e.id} className="row-between">
              <span>{e.number}화 {e.title} <EpisodeStatus ep={e} /> {e.hidden && <span className="ep-badge draft">숨김</span>}</span>
              <span className="row-gap">
                {e.status !== 'draft' && <Link className="btn btn-sm btn-ghost" to={`/episodes/${e.id}`}>보기</Link>}
                <button type="button" className="btn btn-sm" onClick={() => epAction(e, e.hidden ? 'show' : 'hide')}>{e.hidden ? '숨김 해제' : '숨김'}</button>
                <button type="button" className="icon-btn" onClick={() => epAction(e, 'delete')} aria-label="삭제"><Icon name="trash" size={16} /></button>
              </span>
            </li>
          ))}
          {eps?.items.length === 0 && <li className="muted">회차가 없어요.</li>}
        </ul>
      </Modal>
    </>
  );
}

function CommentsAdmin() {
  const toast = useToast();
  const [params, setParams] = useState({ q: '', page: 1 });
  const [data, load] = useList('/admin/comments', params);
  const link = (c) => (c.targetType === 'episode' ? `/episodes/${c.targetId}` : `/illustrations/${c.targetId}`);
  async function hide(c) { try { await api.patch(`/admin/comments/${c.id}`, { hidden: !c.hidden }); load(); } catch (e) { toast.error(e); } }
  async function remove(c) { if (!window.confirm('댓글을 삭제할까요?')) return; try { await api.del(`/admin/comments/${c.id}`); load(); } catch (e) { toast.error(e); } }
  return (
    <>
      <div className="list-tools"><SearchBox placeholder="댓글 내용 검색" onSearch={(q) => setParams({ q, page: 1 })} /></div>
      {!data ? <Spinner /> : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>내용</th><th>작성자</th><th>위치</th><th>날짜</th><th /></tr></thead>
            <tbody>
              {data.items.map((c) => (
                <tr key={c.id} className={c.hidden ? 'dim' : ''}>
                  <td className="cell-text">{c.content}</td>
                  <td>{c.author?.nickname}</td>
                  <td><Link to={link(c)}>{c.targetType === 'episode' ? '웹툰 회차' : '그림'}</Link></td>
                  <td>{fmtDate(c.createdAt, true)}</td>
                  <td className="row-gap">
                    <button type="button" className="btn btn-sm" onClick={() => hide(c)}>{c.hidden ? '숨김 해제' : '숨김'}</button>
                    <button type="button" className="icon-btn" onClick={() => remove(c)} aria-label="삭제"><Icon name="trash" size={16} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {data && <Pager page={data.page} pages={data.pages} onPage={(p) => setParams({ ...params, page: p })} />}
    </>
  );
}

function Reports() {
  const toast = useToast();
  const [status, setStatus] = useState('open');
  const [data, load] = useList('/admin/reports', { status });
  const TL = { webtoon: '웹툰', episode: '회차', illustration: '그림', comment: '댓글', user: '사용자' };
  async function resolve(r, action) {
    const note = action === 'dismiss' ? '' : window.prompt('처리 메모 (선택)', '') ?? null;
    if (note === null) return;
    try { await api.post(`/admin/reports/${r.id}/resolve`, { action, note }); toast.success('처리했어요.'); load(); } catch (e) { toast.error(e); }
  }
  return (
    <>
      <div className="list-tools">
        <div className="seg seg-sm">
          {[['open', '대기'], ['resolved', '처리됨'], ['dismissed', '기각']].map(([v, l]) => <button type="button" key={v} className={status === v ? 'on' : ''} onClick={() => setStatus(v)}>{l}</button>)}
        </div>
      </div>
      {!data ? <Spinner /> : data.items.length === 0 ? <p className="muted center">신고가 없어요.</p> : (
        <ul className="report-list">
          {data.items.map((r) => (
            <li key={r.id} className="panel">
              <div className="row-between">
                <span><span className="ep-badge sch">{TL[r.targetType]}</span> {r.link ? <Link to={r.link}>{r.preview}</Link> : r.preview}</span>
                <span className="muted small">{r.reporter?.nickname} · {fmtDate(r.createdAt, true)}</span>
              </div>
              <p>사유: {r.reason}</p>
              {r.status === 'open' ? (
                <div className="row-gap wrap">
                  {r.targetType !== 'user' && <button type="button" className="btn btn-sm" onClick={() => resolve(r, 'hide')}>숨김 처리</button>}
                  {r.targetType !== 'user' && <button type="button" className="btn btn-sm btn-danger" onClick={() => resolve(r, 'delete')}>삭제</button>}
                  {r.targetType === 'user' && <button type="button" className="btn btn-sm btn-danger" onClick={() => resolve(r, 'suspend')}>계정 정지</button>}
                  <button type="button" className="btn btn-sm btn-ghost" onClick={() => resolve(r, 'dismiss')}>기각</button>
                </div>
              ) : <p className="muted small">처리: {r.resolution}</p>}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

const TABS = [['dash', '대시보드'], ['cookies', '쿠키 지급'], ['users', '사용자'], ['webtoons', '웹툰'], ['illustrations', '그림'], ['comments', '댓글'], ['reports', '신고']];

export default function Admin() {
  const [sp, setSp] = useSearchParams();
  const tab = sp.get('tab') || 'dash';
  const go = (t) => setSp(t === 'dash' ? {} : { tab: t });
  return (
    <div className="page">
      <div className="page-head"><h1>관리자</h1></div>
      <div className="tabs tabs-line scroll-x">
        {TABS.map(([v, l]) => <button key={v} type="button" className={tab === v ? 'on' : ''} onClick={() => go(v)}>{l}</button>)}
      </div>
      {tab === 'dash' && <Dashboard go={go} />}
      {tab === 'cookies' && <CookieSend />}
      {tab === 'users' && <Users />}
      {tab === 'webtoons' && <ContentList key="w" kind="webtoons" />}
      {tab === 'illustrations' && <ContentList key="i" kind="illustrations" />}
      {tab === 'comments' && <CommentsAdmin />}
      {tab === 'reports' && <Reports />}
    </div>
  );
}
