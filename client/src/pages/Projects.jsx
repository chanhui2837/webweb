import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { GENRES, fmtRelative } from '../lib/format.js';
import { useToast } from '../context/ToastContext.jsx';
import { Empty, Field, Icon, Modal, Spinner, WebtoonCard } from '../components/ui.jsx';

export default function Projects() {
  const [sp, setSp] = useSearchParams();
  const tab = sp.get('tab') === 'illustrations' ? 'illustrations' : 'webtoons';
  const toast = useToast();
  const nav = useNavigate();
  const [works, setWorks] = useState(null);
  const [modal, setModal] = useState(null); // 'webtoon' | 'illustration'
  const [form, setForm] = useState({ title: '', genre: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { api.get('/users/me/works').then(setWorks).catch((e) => toast.error(e)); }, [toast]);

  const open = (kind) => { setForm({ title: '', genre: '' }); setError(''); setModal(kind); };

  async function create(e) {
    e?.preventDefault();
    setError('');
    if (!form.title.trim()) { setError('제목을 입력해 주세요.'); return; }
    if (modal === 'webtoon' && !form.genre) { setError('장르를 선택해 주세요.'); return; }
    setBusy(true);
    try {
      if (modal === 'webtoon') {
        const r = await api.post('/webtoons', { title: form.title, genre: form.genre });
        toast.success('웹툰 프로젝트를 만들었어요. 표지와 소개를 채우고 첫 회차를 그려 보세요!');
        nav(`/projects/webtoons/${r.webtoon.id}`);
      } else {
        const r = await api.post('/illustrations', { title: form.title });
        nav(`/projects/illustrations/${r.illustration.id}`);
      }
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>프로젝트</h1>
          <p className="muted">내 웹툰과 그림을 만들고 관리하는 작업실이에요.</p>
        </div>
        <div className="row-gap">
          <button type="button" className="btn btn-primary" onClick={() => open('webtoon')}><Icon name="plus" size={16} /> 새 웹툰</button>
          <button type="button" className="btn" onClick={() => open('illustration')}><Icon name="brush" size={16} /> 새 그림</button>
        </div>
      </div>
      <div className="tabs tabs-line">
        <button type="button" className={tab === 'webtoons' ? 'on' : ''} onClick={() => setSp({})}>웹툰 {works && <span className="muted">{works.webtoons.length}</span>}</button>
        <button type="button" className={tab === 'illustrations' ? 'on' : ''} onClick={() => setSp({ tab: 'illustrations' })}>그림 {works && <span className="muted">{works.illustrations.length}</span>}</button>
      </div>

      {!works && <Spinner />}
      {works && tab === 'webtoons' && (works.webtoons.length === 0
        ? <Empty title="아직 만든 웹툰이 없어요" action={<button type="button" className="btn btn-primary" onClick={() => open('webtoon')}>첫 웹툰 만들기</button>}>제목과 장르만 정하면 바로 시작할 수 있어요.</Empty>
        : <div className="grid-cards">{works.webtoons.map((w) => <WebtoonCard key={w.id} w={w} showStatus to={`/projects/webtoons/${w.id}`} />)}</div>)}
      {works && tab === 'illustrations' && (works.illustrations.length === 0
        ? <Empty title="아직 그린 그림이 없어요" action={<button type="button" className="btn btn-primary" onClick={() => open('illustration')}>새 그림 그리기</button>} />
        : (
          <div className="grid-cards">
            {works.illustrations.map((i) => (
              <Link key={i.id} to={`/projects/illustrations/${i.id}`} className="wcard">
                <div className="wcard-thumb square">
                  {i.imageUrl ? <img src={i.imageUrl} alt="" loading="lazy" /> : <div className="thumb-empty">{i.title.slice(0, 2)}</div>}
                  <span className={`status-chip ${i.status === 'published' ? 'on' : ''}`}>{i.hidden ? '숨김됨' : i.status === 'published' ? (i.visibility === 'public' ? '공개' : '비공개') : '임시저장'}</span>
                </div>
                <div className="wcard-body">
                  <strong className="wcard-title">{i.title}</strong>
                  <span className="wcard-author">{fmtRelative(i.updatedAt)} 수정</span>
                </div>
              </Link>
            ))}
          </div>
        ))}

      <Modal
        open={!!modal}
        title={modal === 'webtoon' ? '새 웹툰 만들기' : '새 그림 그리기'}
        onClose={() => setModal(null)}
        footer={<><button type="button" className="btn" onClick={() => setModal(null)}>취소</button><button type="button" className="btn btn-primary" disabled={busy} onClick={create}>만들기</button></>}
      >
        <form onSubmit={create}>
          <Field label={modal === 'webtoon' ? '웹툰 제목 *' : '그림 제목 *'} htmlFor="p-title">
            <input id="p-title" className="input" maxLength={60} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </Field>
          {modal === 'webtoon' && (
            <Field label="장르 *">
              <div className="chips chips-wrap">
                {GENRES.map((g) => <button type="button" key={g} className={form.genre === g ? 'on' : ''} onClick={() => setForm({ ...form, genre: g })}>{g}</button>)}
              </div>
            </Field>
          )}
          {error && <p className="form-error">{error}</p>}
        </form>
      </Modal>
    </div>
  );
}
