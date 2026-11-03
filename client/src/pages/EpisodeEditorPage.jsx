import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import Editor from '../editor/Editor.jsx';
import { canvasToBlob, renderDocToCanvas } from '../editor/core.js';
import { api } from '../lib/api.js';
import { fmtDate, kstInputValue } from '../lib/format.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { Empty, EpisodeStatus, Icon, Modal, Spinner } from '../components/ui.jsx';
import { LogoMark } from '../components/Logo.jsx';

async function makeThumbnail(canvas) {
  // 첫 페이지 윗부분을 4:3 으로 잘라 회차 썸네일 생성
  const w = Math.min(600, canvas.width);
  const h = Math.round(w * 0.75);
  const srcH = Math.min(canvas.height, Math.round(canvas.width * 0.75));
  const t = document.createElement('canvas');
  t.width = w;
  t.height = h;
  const ctx = t.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(canvas, 0, 0, canvas.width, srcH, 0, 0, w, Math.round(srcH * (w / canvas.width)));
  return new Promise((r) => t.toBlob((b) => r(b), 'image/jpeg', 0.85));
}

export default function EpisodeEditorPage() {
  const { id } = useParams();
  const toast = useToast();
  const nav = useNavigate();
  const { refresh } = useAuth();
  const editorRef = useRef(null);
  const cacheRef = useRef(new Map()); // pageId → doc data
  const [ep, setEp] = useState(null);
  const [webtoon, setWebtoon] = useState(null);
  const [error, setError] = useState('');
  const [current, setCurrent] = useState(0);
  const [docData, setDocData] = useState(undefined);
  const [defaultSize, setDefaultSize] = useState({ w: 800, h: 1280 });
  const [thumbs, setThumbs] = useState({});
  const [dirty, setDirty] = useState(false);
  const [meta, setMeta] = useState({ title: '', authorNote: '' });
  const [metaDirty, setMetaDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(null);
  const [preview, setPreview] = useState(null);
  const [publishOpen, setPublishOpen] = useState(false);
  const [pub, setPub] = useState({ mode: 'now', at: kstInputValue(60), thumb: 'auto', thumbUrl: '' });
  const [progress, setProgress] = useState('');
  const [busy, setBusy] = useState(false);
  const [pagesOpen, setPagesOpen] = useState(false);

  /* ---------- 불러오기 ---------- */
  const loadPage = useCallback(async (page) => {
    setDocData(undefined);
    if (!page.editorDocId) { setDocData(null); return; }
    if (cacheRef.current.has(page.id)) { setDocData(cacheRef.current.get(page.id)); return; }
    const r = await api.get(`/editor-docs/${page.editorDocId}`);
    cacheRef.current.set(page.id, r.data);
    if (r.data) setDefaultSize({ w: r.data.width, h: r.data.height });
    setDocData(r.data);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const r = await api.get(`/episodes/${id}/edit`);
        setEp(r.episode);
        setWebtoon(r.webtoon);
        setMeta({ title: r.episode.title, authorNote: r.episode.authorNote || '' });
        setPub((p) => ({ ...p, mode: r.episode.status === 'draft' ? 'now' : 'update', at: r.episode.publishAt ? kstInputValue((new Date(r.episode.publishAt) - Date.now()) / 60000) : p.at }));
        const t = {};
        r.episode.pages.forEach((p) => { if (p.imageUrl) t[p.id] = p.imageUrl; });
        setThumbs(t);
        await loadPage(r.episode.pages[0]);
      } catch (e) { setError(e.message); }
    })();
  }, [id, loadPage]);

  /* ---------- 저장 ---------- */
  const saveCurrent = useCallback(async ({ quiet = false } = {}) => {
    if (!ep) return true;
    const page = ep.pages[current];
    const ed = editorRef.current;
    try {
      if (ed && ed.isDirty()) {
        const data = ed.getData();
        await api.put(`/editor-docs/${page.editorDocId}`, { data });
        cacheRef.current.set(page.id, data);
        setThumbs((t) => ({ ...t, [page.id]: ed.thumbnail() }));
        ed.markSaved();
      }
      if (metaDirty) {
        await api.patch(`/episodes/${id}`, meta);
        setMetaDirty(false);
      }
      setSavedAt(new Date());
      if (!quiet) toast.success('임시저장했어요.');
      return true;
    } catch (e) {
      toast.error(e);
      return false;
    }
  }, [ep, current, metaDirty, meta, id, toast]);

  async function onSaveClick() {
    setSaving(true);
    await saveCurrent();
    setSaving(false);
  }

  // 2분마다 자동 임시저장
  useEffect(() => {
    const t = setInterval(() => { if (editorRef.current?.isDirty() || metaDirty) saveCurrent({ quiet: true }); }, 120000);
    return () => clearInterval(t);
  }, [saveCurrent, metaDirty]);

  // 저장하지 않고 나가기 경고
  useEffect(() => {
    const h = (e) => { if (editorRef.current?.isDirty() || metaDirty) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [metaDirty]);

  /* ---------- 페이지(컷 이미지) 관리 ---------- */
  async function goPage(i) {
    if (i === current) return;
    if (!(await saveCurrent({ quiet: true }))) return;
    setCurrent(i);
    setPagesOpen(false);
    try { await loadPage(ep.pages[i]); } catch (e) { toast.error(e); }
  }
  async function addPage(duplicate = false) {
    if (!(await saveCurrent({ quiet: true }))) return;
    try {
      const r = await api.post(`/episodes/${id}/pages`, { index: current + 1, duplicateFrom: duplicate ? ep.pages[current].id : undefined });
      setEp(r.episode);
      const ni = current + 1;
      setCurrent(ni);
      const d = editorRef.current?.getData();
      if (d) setDefaultSize({ w: d.width, h: d.height });
      await loadPage(r.episode.pages[ni]);
    } catch (e) { toast.error(e); }
  }
  async function removePage(i) {
    if (ep.pages.length <= 1) { toast.info('회차에는 최소 1장이 필요해요.'); return; }
    if (!window.confirm(`${i + 1}번째 장을 삭제할까요? 되돌릴 수 없어요.`)) return;
    try {
      const page = ep.pages[i];
      const r = await api.del(`/episodes/${id}/pages/${page.id}`);
      cacheRef.current.delete(page.id);
      editorRef.current?.markSaved();
      setEp(r.episode);
      const ni = Math.min(i, r.episode.pages.length - 1);
      setCurrent(ni);
      await loadPage(r.episode.pages[ni]);
    } catch (e) { toast.error(e); }
  }
  async function movePage(i, dir) {
    const j = i + dir;
    if (j < 0 || j >= ep.pages.length) return;
    const order = ep.pages.map((p) => p.id);
    [order[i], order[j]] = [order[j], order[i]];
    try {
      const r = await api.patch(`/episodes/${id}`, { pageOrder: order });
      setEp(r.episode);
      if (current === i) setCurrent(j); else if (current === j) setCurrent(i);
    } catch (e) { toast.error(e); }
  }

  /* ---------- 미리보기 / 업로드 ---------- */
  async function pageData(page) {
    if (page.id === ep.pages[current].id && editorRef.current) return editorRef.current.getData();
    if (cacheRef.current.has(page.id)) return cacheRef.current.get(page.id);
    const r = await api.get(`/editor-docs/${page.editorDocId}`);
    cacheRef.current.set(page.id, r.data);
    return r.data;
  }

  async function openPreview() {
    setBusy(true);
    try {
      const urls = [];
      for (let i = 0; i < ep.pages.length; i += 1) {
        setProgress(`미리보기 만드는 중 ${i + 1}/${ep.pages.length}`);
        const c = await renderDocToCanvas(await pageData(ep.pages[i]));
        urls.push(c.toDataURL('image/jpeg', 0.85));
      }
      setPreview(urls);
    } catch (e) { toast.error(e); } finally { setBusy(false); setProgress(''); }
  }

  async function publish() {
    if (pub.mode === 'schedule' && !pub.at) { toast.error('예약 날짜와 시간을 선택해 주세요.'); return; }
    setBusy(true);
    try {
      if (!(await saveCurrent({ quiet: true }))) return;
      if (metaDirty) await api.patch(`/episodes/${id}`, meta);
      const pages = [];
      let firstCanvas = null;
      for (let i = 0; i < ep.pages.length; i += 1) {
        setProgress(`${i + 1}/${ep.pages.length}번째 장 렌더링·업로드 중…`);
        const canvas = await renderDocToCanvas(await pageData(ep.pages[i]));
        if (i === 0) firstCanvas = canvas;
        const blob = await canvasToBlob(canvas);
        const up = await api.upload('/uploads/image?kind=page', blob, `page-${i + 1}.png`);
        pages.push({ id: ep.pages[i].id, imageUrl: up.url, width: canvas.width, height: canvas.height });
      }
      let thumbnailUrl;
      if (pub.thumb === 'custom' && pub.thumbUrl) thumbnailUrl = pub.thumbUrl;
      else if (firstCanvas) {
        setProgress('썸네일 만드는 중…');
        const tb = await makeThumbnail(firstCanvas);
        thumbnailUrl = (await api.upload('/uploads/image?kind=episode-thumb', tb, 'thumb.jpg')).url;
      }
      setProgress('업로드 마무리 중…');
      const r = await api.post(`/episodes/${id}/publish`, { mode: pub.mode, publishAt: pub.mode === 'schedule' ? pub.at : undefined, pages, thumbnailUrl });
      setEp(r.episode);
      setPublishOpen(false);
      if (r.reward) toast.reward(r.reward);
      refresh();
      toast.success(pub.mode === 'now' ? '회차를 공개했어요!' : pub.mode === 'schedule' ? `${fmtDate(r.episode.publishAt, true)}에 공개되도록 예약했어요.` : '수정 내용을 반영했어요.');
      if (webtoon.visibility !== 'public') toast.info('작품이 비공개 상태라 독자에게는 아직 보이지 않아요. 작품 설정에서 공개로 바꿔 주세요.');
      nav(`/projects/webtoons/${webtoon.id}`);
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
      setProgress('');
    }
  }

  async function pickThumb(e) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    try {
      const r = await api.upload('/uploads/image?kind=episode-thumb', f);
      setPub((p) => ({ ...p, thumb: 'custom', thumbUrl: r.url }));
    } catch (err) { toast.error(err); }
  }

  if (error) return <div className="page"><Empty title={error} action={<Link className="btn" to="/projects">프로젝트로</Link>} /></div>;
  if (!ep) return <Spinner />;

  const saveLabel = saving ? '저장 중…' : dirty || metaDirty ? '저장 안 된 변경 있음' : savedAt ? `${fmtDate(savedAt, true).slice(-5)} 저장됨` : '저장됨';

  return (
    <div className="editor-page">
      <header className="ed-header">
        <Link to={`/projects/webtoons/${webtoon.id}`} className="icon-btn" aria-label="작품 관리로" onClick={(e) => { if ((editorRef.current?.isDirty() || metaDirty) && !window.confirm('저장하지 않은 변경이 있어요. 나갈까요?')) e.preventDefault(); }}>
          <Icon name="chevronL" />
        </Link>
        <LogoMark size={28} />
        <div className="ed-title">
          <span>{webtoon.title} · {ep.number}화 <EpisodeStatus ep={ep} /></span>
          <input value={meta.title} maxLength={80} onChange={(e) => { setMeta({ ...meta, title: e.target.value }); setMetaDirty(true); }} aria-label="회차 제목" />
        </div>
        <span className={`ed-save ${dirty || metaDirty ? 'warn' : ''}`}>{saveLabel}</span>
        <div className="ed-actions">
          <button type="button" className="btn btn-sm ed-pages-btn" onClick={() => setPagesOpen((v) => !v)}>장 {current + 1}/{ep.pages.length}</button>
          <button type="button" className="btn btn-sm" onClick={onSaveClick} disabled={saving}>임시저장</button>
          <button type="button" className="btn btn-sm" onClick={openPreview} disabled={busy}>미리보기</button>
          <button type="button" className="btn btn-sm btn-primary" onClick={() => setPublishOpen(true)} disabled={busy}>{ep.status === 'draft' ? '업로드' : '수정 반영'}</button>
        </div>
      </header>
      {progress && <div className="ed-progress">{progress}</div>}

      <div className="ed-body">
        <aside className={`ed-pages ${pagesOpen ? 'open' : ''}`} aria-label="회차 페이지">
          <p className="ed-pages-title">회차 구성 <small>위→아래로 이어져요</small></p>
          <ol>
            {ep.pages.map((p, i) => (
              <li key={p.id} className={i === current ? 'on' : ''}>
                <button type="button" className="ed-page-thumb" onClick={() => goPage(i)} aria-label={`${i + 1}번째 장 편집`}>
                  {thumbs[p.id] ? <img src={thumbs[p.id]} alt="" /> : <span>{i + 1}</span>}
                </button>
                <div className="ed-page-tools">
                  <span>{i + 1}</span>
                  <button type="button" onClick={() => movePage(i, -1)} disabled={i === 0} aria-label="위로"><Icon name="up" size={14} /></button>
                  <button type="button" onClick={() => movePage(i, 1)} disabled={i === ep.pages.length - 1} aria-label="아래로"><Icon name="down" size={14} /></button>
                  <button type="button" onClick={() => removePage(i)} aria-label="삭제"><Icon name="trash" size={14} /></button>
                </div>
              </li>
            ))}
          </ol>
          <button type="button" className="btn btn-sm btn-block" onClick={() => addPage(false)}><Icon name="plus" size={14} /> 새 장 추가</button>
          <button type="button" className="btn btn-sm btn-ghost btn-block" onClick={() => addPage(true)}><Icon name="copy" size={14} /> 현재 장 복제</button>
        </aside>
        <div className="ed-main">
          {docData === undefined ? <div className="ed-loading">페이지를 불러오는 중…</div> : (
            <Editor ref={editorRef} key={ep.pages[current].id} data={docData} defaultSize={defaultSize} onDirtyChange={setDirty} />
          )}
        </div>
      </div>

      <Modal open={!!preview} title={`미리보기 — ${ep.number}화 ${meta.title}`} onClose={() => setPreview(null)} wide>
        <div className="preview-strip">{preview?.map((u, i) => <img key={i} src={u} alt={`${i + 1}번째 장`} />)}</div>
      </Modal>

      <Modal open={publishOpen} title={ep.status === 'draft' ? '회차 업로드' : '회차 수정 반영'} onClose={() => !busy && setPublishOpen(false)}
        footer={<><button type="button" className="btn" disabled={busy} onClick={() => setPublishOpen(false)}>취소</button><button type="button" className="btn btn-primary" disabled={busy} onClick={publish}>{busy ? '업로드 중…' : pub.mode === 'schedule' ? '예약하기' : pub.mode === 'now' ? '지금 공개' : '수정 반영'}</button></>}>
        <div className="radio-cards">
          {ep.status === 'published' ? (
            <label className="on"><input type="radio" checked readOnly /> <div><strong>수정 내용 반영</strong><span>이미 공개된 회차의 그림을 지금 편집한 내용으로 바꿔요.</span></div></label>
          ) : (
            <>
              <label className={pub.mode === 'now' ? 'on' : ''}><input type="radio" name="pm" checked={pub.mode === 'now'} onChange={() => setPub({ ...pub, mode: 'now' })} /> <div><strong>즉시 공개</strong><span>업로드하자마자 모든 독자가 무료로 볼 수 있어요.</span></div></label>
              <label className={pub.mode === 'schedule' ? 'on' : ''}><input type="radio" name="pm" checked={pub.mode === 'schedule'} onChange={() => setPub({ ...pub, mode: 'schedule' })} /> <div><strong>예약 공개</strong><span>정한 시각(한국 시간)에 자동 공개돼요. 그 전에는 독자가 쿠키 3개로 미리 볼 수 있어요.</span></div></label>
              {ep.status === 'scheduled' && <label className={pub.mode === 'update' ? 'on' : ''}><input type="radio" name="pm" checked={pub.mode === 'update'} onChange={() => setPub({ ...pub, mode: 'update' })} /> <div><strong>예약 유지하고 그림만 반영</strong><span>현재 예약 시각({fmtDate(ep.publishAt, true)})은 그대로 둬요.</span></div></label>}
            </>
          )}
        </div>
        {pub.mode === 'schedule' && (
          <label className="field">
            <span className="field-label">공개 일시 (한국 시간 KST)</span>
            <input type="datetime-local" className="input" value={pub.at} min={kstInputValue(2)} onChange={(e) => setPub({ ...pub, at: e.target.value })} />
          </label>
        )}
        <label className="field">
          <span className="field-label">작가의 말 (선택)</span>
          <textarea className="input" rows={2} maxLength={500} value={meta.authorNote} onChange={(e) => { setMeta({ ...meta, authorNote: e.target.value }); setMetaDirty(true); }} />
        </label>
        <div className="field">
          <span className="field-label">회차 썸네일</span>
          <div className="seg">
            <button type="button" className={pub.thumb === 'auto' ? 'on' : ''} onClick={() => setPub({ ...pub, thumb: 'auto' })}>첫 장에서 자동 생성</button>
            <label className={`seg-file ${pub.thumb === 'custom' ? 'on' : ''}`}>직접 올리기<input type="file" accept="image/*" hidden onChange={pickThumb} /></label>
          </div>
          {pub.thumb === 'custom' && pub.thumbUrl && <img className="thumb-preview" src={pub.thumbUrl} alt="썸네일 미리보기" />}
        </div>
        <p className="field-hint">총 {ep.pages.length}장이 위에서 아래로 이어진 세로 스크롤로 공개돼요.</p>
        {progress && <p className="notice">{progress}</p>}
      </Modal>
    </div>
  );
}
