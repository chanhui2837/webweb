import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { IMAGE_ACCEPT, normalizeImageFile } from '../lib/imageFile.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { Avatar, Empty, Field, IllustCard, Spinner, WebtoonCard } from '../components/ui.jsx';

function Settings() {
  const { user, setUser, setWallet } = useAuth();
  const toast = useToast();
  const fileRef = useRef(null);
  const [f, setF] = useState({ nickname: user.nickname, bio: user.bio || '', email: user.email || '', phone: user.phone || '', currentPassword: '' });
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '', newPassword2: '' });
  const [busy, setBusy] = useState(false);
  const recoveryChanged = f.email !== (user.email || '') || f.phone !== (user.phone || '');

  async function uploadAvatar(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const r = await api.upload('/users/me/avatar', await normalizeImageFile(file, 1600));
      setUser(r.user);
      toast.success('프로필 사진을 바꿨어요.');
      if (r.reward) toast.reward(r.reward);
    } catch (err) { toast.error(err); }
  }
  async function removeAvatar() {
    try { const r = await api.del('/users/me/avatar'); setUser(r.user); } catch (err) { toast.error(err); }
  }
  async function saveProfile(e) {
    e.preventDefault();
    setBusy(true);
    try {
      const body = { nickname: f.nickname, bio: f.bio };
      if (recoveryChanged) Object.assign(body, { email: f.email, phone: f.phone, currentPassword: f.currentPassword });
      const r = await api.patch('/users/me', body);
      setUser(r.user);
      setWallet(r.wallet);
      setF((x) => ({ ...x, currentPassword: '' }));
      toast.success('프로필을 저장했어요.');
      if (r.reward) toast.reward(r.reward);
    } catch (err) { toast.error(err); } finally { setBusy(false); }
  }
  async function changePassword(e) {
    e.preventDefault();
    if (pw.newPassword !== pw.newPassword2) { toast.error('새 비밀번호가 서로 달라요.'); return; }
    try {
      const r = await api.post('/auth/change-password', { currentPassword: pw.currentPassword, newPassword: pw.newPassword });
      toast.success(r.message);
      setPw({ currentPassword: '', newPassword: '', newPassword2: '' });
    } catch (err) { toast.error(err); }
  }

  return (
    <div className="settings">
      <section className="panel">
        <h2>프로필</h2>
        <div className="avatar-edit">
          <Avatar user={user} size={88} />
          <div className="row-gap">
            <button type="button" className="btn" onClick={() => fileRef.current.click()}>사진 변경</button>
            {user.avatarUrl && <button type="button" className="btn btn-ghost" onClick={removeAvatar}>삭제</button>}
            <input ref={fileRef} type="file" accept={IMAGE_ACCEPT} hidden onChange={uploadAvatar} />
          </div>
        </div>
        <form onSubmit={saveProfile}>
          <Field label="아이디"><input className="input" value={user.username} disabled /></Field>
          <Field label="닉네임" htmlFor="pf-n" hint="2~16자"><input id="pf-n" className="input" maxLength={16} value={f.nickname} onChange={(e) => setF({ ...f, nickname: e.target.value })} /></Field>
          <Field label="자기소개" htmlFor="pf-b" hint={`${f.bio.length}/500`}><textarea id="pf-b" className="input" rows={3} maxLength={500} value={f.bio} onChange={(e) => setF({ ...f, bio: e.target.value })} /></Field>
          <div className="grid-2">
            <Field label="이메일" htmlFor="pf-e"><input id="pf-e" type="email" className="input" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
            <Field label="전화번호" htmlFor="pf-p"><input id="pf-p" type="tel" className="input" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} placeholder="010-1234-5678" /></Field>
          </div>
          {!f.email && !f.phone && <p className="notice notice-warn">이메일과 전화번호가 모두 비어 있으면 아이디·비밀번호 찾기를 이용할 수 없어요.</p>}
          {recoveryChanged && (
            <Field label="현재 비밀번호 (이메일·전화번호 변경 확인용)" htmlFor="pf-cp"><input id="pf-cp" type="password" className="input" autoComplete="current-password" value={f.currentPassword} onChange={(e) => setF({ ...f, currentPassword: e.target.value })} /></Field>
          )}
          <button type="submit" className="btn btn-primary" disabled={busy}>저장</button>
        </form>
      </section>
      <section className="panel">
        <h2>비밀번호 변경</h2>
        <form onSubmit={changePassword}>
          <Field label="현재 비밀번호" htmlFor="pw-c"><input id="pw-c" type="password" className="input" autoComplete="current-password" value={pw.currentPassword} onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })} /></Field>
          <Field label="새 비밀번호" htmlFor="pw-n" hint="영문+숫자 포함 8자 이상"><input id="pw-n" type="password" className="input" autoComplete="new-password" value={pw.newPassword} onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} /></Field>
          <Field label="새 비밀번호 확인" htmlFor="pw-n2"><input id="pw-n2" type="password" className="input" autoComplete="new-password" value={pw.newPassword2} onChange={(e) => setPw({ ...pw, newPassword2: e.target.value })} /></Field>
          <button type="submit" className="btn" disabled={!pw.currentPassword || !pw.newPassword}>비밀번호 변경</button>
        </form>
      </section>
    </div>
  );
}

function MyWorks({ kind }) {
  const toast = useToast();
  const [data, setData] = useState(null);
  useEffect(() => {
    (kind === 'saved' ? api.get('/users/me/saved') : api.get('/users/me/works')).then(setData).catch((e) => toast.error(e));
  }, [kind, toast]);
  if (!data) return <Spinner />;
  if (kind === 'webtoons') {
    return data.webtoons.length
      ? <div className="grid-cards">{data.webtoons.map((w) => <WebtoonCard key={w.id} w={w} showStatus to={`/projects/webtoons/${w.id}`} />)}</div>
      : <Empty title="만든 웹툰이 없어요" action={<Link className="btn btn-primary" to="/projects">웹툰 만들기</Link>} />;
  }
  if (kind === 'illustrations') {
    const list = data.illustrations.filter((i) => i.status === 'published');
    return list.length
      ? <div className="masonry">{list.map((i) => <IllustCard key={i.id} i={i} />)}</div>
      : <Empty title="업로드한 그림이 없어요" action={<Link className="btn btn-primary" to="/projects?tab=illustrations">그림 그리기</Link>} />;
  }
  return (
    <>
      <h3 className="sub-title">관심 웹툰</h3>
      {data.webtoons.length ? <div className="grid-cards">{data.webtoons.map((w) => <WebtoonCard key={w.id} w={w} />)}</div> : <p className="muted">관심 웹툰이 없어요.</p>}
      <h3 className="sub-title">저장한 그림</h3>
      {data.illustrations.length ? <div className="masonry">{data.illustrations.map((i) => <IllustCard key={i.id} i={i} />)}</div> : <p className="muted">저장한 그림이 없어요.</p>}
    </>
  );
}

export default function Profile() {
  const { user } = useAuth();
  const [sp, setSp] = useSearchParams();
  const tab = sp.get('tab') || 'settings';
  const TABS = [['settings', '내 정보'], ['webtoons', '내가 만든 웹툰'], ['illustrations', '내가 올린 그림'], ['saved', '저장한 작품']];
  return (
    <div className="page">
      <div className="profile-head">
        <Avatar user={user} size={72} />
        <div>
          <h1>{user.nickname}</h1>
          <p className="muted">@{user.username}{user.isAdmin && ' · 관리자'}</p>
          {user.bio && <p className="profile-bio">{user.bio}</p>}
        </div>
        <Link className="btn btn-ghost" to={`/u/${user.username}`}>공개 페이지 보기</Link>
      </div>
      <div className="tabs tabs-line">
        {TABS.map(([v, l]) => <button key={v} type="button" className={tab === v ? 'on' : ''} onClick={() => setSp(v === 'settings' ? {} : { tab: v })}>{l}</button>)}
      </div>
      {tab === 'settings' ? <Settings /> : <MyWorks kind={tab} />}
    </div>
  );
}
