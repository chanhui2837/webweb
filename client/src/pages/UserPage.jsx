import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { fmtDate, fmtNum } from '../lib/format.js';
import { useAuth } from '../context/AuthContext.jsx';
import { Avatar, Empty, IllustCard, Spinner, WebtoonCard } from '../components/ui.jsx';
import ReportButton from '../components/ReportButton.jsx';

export default function UserPage() {
  const { username } = useParams();
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('webtoons');

  useEffect(() => {
    setData(null);
    api.get(`/users/${encodeURIComponent(username)}`).then(setData).catch((e) => setError(e.message));
  }, [username]);

  if (error) return <div className="page"><Empty title={error} /></div>;
  if (!data) return <Spinner />;
  const u = data.user;
  return (
    <div className="page">
      <div className="profile-head">
        <Avatar user={u} size={88} />
        <div>
          <h1>{u.nickname}</h1>
          <p className="muted">@{u.username} · {fmtDate(u.createdAt)} 가입</p>
          {u.bio && <p className="profile-bio">{u.bio}</p>}
          <p className="profile-stats">웹툰 <strong>{data.stats.webtoons}</strong> · 그림 <strong>{data.stats.illustrations}</strong> · 받은 좋아요 <strong>{fmtNum(data.stats.totalLikes)}</strong></p>
        </div>
        {data.isMe ? <Link className="btn" to="/profile">프로필 편집</Link> : user && <ReportButton targetType="user" targetId={u.id} />}
      </div>
      <div className="tabs tabs-line">
        <button type="button" className={tab === 'webtoons' ? 'on' : ''} onClick={() => setTab('webtoons')}>웹툰 {data.webtoons.length}</button>
        <button type="button" className={tab === 'illustrations' ? 'on' : ''} onClick={() => setTab('illustrations')}>그림 {data.illustrations.length}</button>
      </div>
      {tab === 'webtoons' && (data.webtoons.length ? <div className="grid-cards">{data.webtoons.map((w) => <WebtoonCard key={w.id} w={w} />)}</div> : <Empty title="공개된 웹툰이 없어요" />)}
      {tab === 'illustrations' && (data.illustrations.length ? <div className="masonry">{data.illustrations.map((i) => <IllustCard key={i.id} i={i} />)}</div> : <Empty title="공개된 그림이 없어요" />)}
    </div>
  );
}
