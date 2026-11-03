import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import Editor from '../editor/Editor.jsx';
import { loadDoc } from '../editor/docApi.js';
import { api } from '../lib/api.js';
import { fmtDate } from '../lib/format.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { Empty, Field, Icon, Modal, Spinner } from '../components/ui.jsx';
import { LogoMark } from '../components/Logo.jsx';

export default function IllustrationEditorPage() {
  const { id } = useParams();
  const toast = useToast();
  const nav = useNavigate();
  const { refresh } = useAuth();
  const editorRef = useRef(null);
  const [ill, setIll] = useState(null);
  const [docData, setDocData] = useState(undefined);
  const [error, setError] = useState('');
  const [dirty, setDirty] = useState(false);
  const [title, setTitle] = useState('');
  const [titleDirty, setTitleDirty] = useState(false);
  const [savedAt, setSavedAt] = useState(null);
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ description: '', tags: '', visibility: 'public' });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const r = await api.get(`/illustrations/${id}/edit`);
        const i = r.illustration;
        setIll(i);
        setTitle(i.title);
        setForm({ description: i.description || '', tags: (i.tags || []).join(' '), visibility: i.visibility });
        setDocData(await loadDoc(i.editorDocId));
      } catch (e) { setError(e.message); }
    })();
  }, [id]);

  const save = useCallback(async ({ quiet = false } = {}) => {
    const ed = editorRef.current;
    try {
      if (ed?.isDirty()) await ed.save();
      if (titleDirty) {
        await api.patch(`/illustrations/${id}`, { title });
        setTitleDirty(false);
      }
      setSavedAt(new Date());
      if (!quiet) toast.success('임시저장했어요.');
      return true;
    } catch (e) { toast.error(e); return false; }
  }, [ill, titleDirty, title, id, toast]);

  useEffect(() => {
    const t = setInterval(() => { if (editorRef.current?.isDirty() || titleDirty) save({ quiet: true }); }, 120000);
    const h = (e) => { if (editorRef.current?.isDirty() || titleDirty) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', h);
    return () => { clearInterval(t); window.removeEventListener('beforeunload', h); };
  }, [save, titleDirty]);

  async function publish() {
    if (!title.trim()) { toast.error('제목을 입력해 주세요.'); return; }
    setBusy(true);
    try {
      if (!(await save({ quiet: true }))) return;
      const { blob, width, height } = await editorRef.current.renderBlob();
      const up = await api.upload('/uploads/image?kind=illustration', blob, 'illustration.png');
      const tags = form.tags.split(/[\s,]+/).map((t) => t.replace(/^#/, '')).filter(Boolean).slice(0, 10);
      const r = await api.post(`/illustrations/${id}/publish`, { title, description: form.description, tags, visibility: form.visibility, imageUrl: up.url, width, height });
      if (r.reward) toast.reward(r.reward);
      refresh();
      toast.success(ill.status === 'published' ? '그림을 업데이트했어요.' : '그림을 업로드했어요!');
      nav(`/illustrations/${id}`);
    } catch (e) { toast.error(e); } finally { setBusy(false); }
  }

  async function unpublish() {
    if (!window.confirm('공개를 취소하고 임시저장 상태로 되돌릴까요?')) return;
    try { const r = await api.post(`/illustrations/${id}/unpublish`); setIll({ ...ill, ...r.illustration, editorDocId: ill.editorDocId }); toast.success('공개를 취소했어요.'); } catch (e) { toast.error(e); }
  }
  async function remove() {
    if (!window.confirm('이 그림을 영구 삭제할까요? 좋아요·댓글도 함께 삭제돼요.')) return;
    try { await api.del(`/illustrations/${id}`); setDirty(false); setTitleDirty(false); toast.success('삭제했어요.'); nav('/projects?tab=illustrations'); } catch (e) { toast.error(e); }
  }

  if (error) return <div className="page"><Empty title={error} action={<Link className="btn" to="/projects?tab=illustrations">프로젝트로</Link>} /></div>;
  if (!ill) return <Spinner />;

  return (
    <div className="editor-page">
      <header className="ed-header">
        <Link to="/projects?tab=illustrations" className="icon-btn" aria-label="프로젝트로" onClick={(e) => { if ((editorRef.current?.isDirty() || titleDirty) && !window.confirm('저장하지 않은 변경이 있어요. 나갈까요?')) e.preventDefault(); }}>
          <Icon name="chevronL" />
        </Link>
        <LogoMark size={28} />
        <div className="ed-title">
          <span>그림 · {ill.status === 'published' ? '공개됨' : '임시저장'}</span>
          <input value={title} maxLength={60} onChange={(e) => { setTitle(e.target.value); setTitleDirty(true); }} aria-label="그림 제목" />
        </div>
        <span className={`ed-save ${dirty || titleDirty ? 'warn' : ''}`}>{saving ? '저장 중…' : dirty || titleDirty ? '저장 안 된 변경 있음' : savedAt ? `${fmtDate(savedAt, true).slice(-5)} 저장됨` : '저장됨'}</span>
        <div className="ed-actions">
          <button type="button" className="btn btn-sm" disabled={saving} onClick={async () => { setSaving(true); await save(); setSaving(false); }}>임시저장</button>
          {ill.status === 'published' && <button type="button" className="btn btn-sm btn-ghost" onClick={unpublish}>공개 취소</button>}
          <button type="button" className="btn btn-sm btn-ghost" onClick={remove} aria-label="삭제"><Icon name="trash" size={16} /></button>
          <button type="button" className="btn btn-sm btn-primary" onClick={() => setOpen(true)}>{ill.status === 'published' ? '업데이트' : '업로드'}</button>
        </div>
      </header>
      <div className="ed-body">
        <div className="ed-main">
          {docData === undefined ? <div className="ed-loading">불러오는 중…</div> : (
            <Editor ref={editorRef} docId={ill.editorDocId} data={docData} defaultSize={{ w: 1200, h: 1200 }} onDirtyChange={setDirty} />
          )}
        </div>
      </div>
      <Modal open={open} title="그림 업로드" onClose={() => !busy && setOpen(false)}
        footer={<><button type="button" className="btn" onClick={() => setOpen(false)} disabled={busy}>취소</button><button type="button" className="btn btn-primary" onClick={publish} disabled={busy}>{busy ? '올리는 중…' : '업로드'}</button></>}>
        <Field label="제목" htmlFor="il-t"><input id="il-t" className="input" maxLength={60} value={title} onChange={(e) => { setTitle(e.target.value); setTitleDirty(true); }} /></Field>
        <Field label="설명 (선택)" htmlFor="il-d"><textarea id="il-d" className="input" rows={3} maxLength={2000} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
        <Field label="태그 (띄어쓰기로 구분, 최대 10개)" htmlFor="il-tag"><input id="il-tag" className="input" placeholder="#풍경 #캐릭터" value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} /></Field>
        <Field label="공개 범위">
          <div className="seg">
            <button type="button" className={form.visibility === 'public' ? 'on' : ''} onClick={() => setForm({ ...form, visibility: 'public' })}>전체 공개</button>
            <button type="button" className={form.visibility === 'private' ? 'on' : ''} onClick={() => setForm({ ...form, visibility: 'private' })}>나만 보기</button>
          </div>
        </Field>
      </Modal>
    </div>
  );
}
