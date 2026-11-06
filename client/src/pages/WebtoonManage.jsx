import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { GENRES, epLabel, fmtDate, fmtNum } from '../lib/format.js';
import { useToast } from '../context/ToastContext.jsx';
import { BANNER_RATIO, Empty, EpisodeStatus, Field, Icon, Modal, Spinner, WebtoonBanner } from '../components/ui.jsx';
import ImageCropper, { BANNER_RATIOS } from '../components/ImageCropper.jsx';
import DrawImageModal, { BANNER_DRAW_SIZES } from '../components/DrawImageModal.jsx';
import { IMAGE_ACCEPT, normalizeImageFile } from '../lib/imageFile.js';

/** 표지·썸네일 선택: 사진 고르기 → 비율 조정 / 직접 그리기
 *  preview 를 주면 기본 미리보기 상자 대신 그걸 보여 준다 (썸네일 = 배너 미리보기) */
function ImagePicker({ label, value, onChange, kind, ratio, cropRatio = 3 / 4, ratios, keepAlpha = false, drawIndex = 0, drawSizes, drawHint, preview }) {
  const ref = useRef(null);
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [cropSrc, setCropSrc] = useState('');
  const [drawing, setDrawing] = useState(false);

  async function pick(e) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    try {
      const file = await normalizeImageFile(f);
      setCropSrc(URL.createObjectURL(file));
    } catch (err) { toast.error(err); }
  }
  async function upload(blob) {
    setBusy(true);
    try {
      const ext = blob.type === 'image/png' ? 'png' : blob.type === 'image/webp' ? 'webp' : 'jpg';
      const r = await api.upload(`/uploads/image?kind=${kind}`, blob, `${kind}.${ext}`);
      onChange(r.url);
      toast.success(`${label.split(' ')[0]}을(를) 넣었어요. ‘설정 저장’을 눌러야 반영돼요.`);
    } finally { setBusy(false); }
  }
  function closeCrop() {
    if (cropSrc.startsWith('blob:')) URL.revokeObjectURL(cropSrc);
    setCropSrc('');
  }

  return (
    <div className="img-picker">
      <span className="img-picker-label">{label}</span>
      {preview ? (
        <div role="button" tabIndex={0} className="img-picker-banner" aria-label={`${label} 사진 선택`} aria-disabled={busy}
          onClick={() => !busy && ref.current.click()}
          onKeyDown={(e) => { if (!busy && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); ref.current.click(); } }}>
          {preview}
          {busy && <span className="img-picker-busy">올리는 중…</span>}
        </div>
      ) : (
        <button type="button" className="img-picker-box" style={{ aspectRatio: ratio }} onClick={() => ref.current.click()} disabled={busy} aria-label={`${label} 사진 선택`}>
          {value ? <img src={value} alt="" className="contain" /> : <span>{busy ? '올리는 중…' : '사진 선택'}</span>}
        </button>
      )}
      <input ref={ref} type="file" accept={IMAGE_ACCEPT} hidden onChange={pick} />
      <div className="img-picker-actions">
        <button type="button" className="btn btn-sm" onClick={() => ref.current.click()} disabled={busy}><Icon name="image" size={14} /> 사진</button>
        <button type="button" className="btn btn-sm" onClick={() => setDrawing(true)} disabled={busy}><Icon name="brush" size={14} /> 그리기</button>
        {value && <button type="button" className="btn btn-sm btn-ghost" onClick={() => setCropSrc(value)} disabled={busy}>비율 조정</button>}
        {value && <button type="button" className="btn btn-sm btn-ghost" onClick={() => onChange('')} disabled={busy}>지우기</button>}
      </div>
      <ImageCropper open={!!cropSrc} src={cropSrc} title={`${label.split(' ')[0]} 비율 조정`} defaultRatio={cropRatio} ratios={ratios} keepAlpha={keepAlpha}
        onCancel={closeCrop}
        onDone={async (blob) => { await upload(blob); closeCrop(); }} />
      <DrawImageModal open={drawing} title={`${label.split(' ')[0]} 그리기`} defaultIndex={drawIndex} sizes={drawSizes} hint={drawHint}
        onCancel={() => setDrawing(false)}
        onDone={async (blob) => { await upload(blob); setDrawing(false); }} />
    </div>
  );
}

/** 썸네일 = 작품 상단 배너. 사진이 배너(가로 3:1) 전체를 꽉 채운다 */
function BannerPicker({ form, setForm }) {
  return (
    <div className="banner-picker">
      <ImagePicker label="썸네일 (작품 상단 배너 · 가로 3:1)" kind="thumbnail" cropRatio={BANNER_RATIO} ratios={BANNER_RATIOS} keepAlpha
        drawIndex={0} drawSizes={BANNER_DRAW_SIZES}
        value={form.thumbnailUrl} onChange={(v) => setForm((f) => ({ ...f, thumbnailUrl: v }))}
        preview={(
          <WebtoonBanner preview w={{ title: form.title }} imageUrl={form.thumbnailUrl} fallbackUrl={form.coverUrl}>
            {!form.thumbnailUrl && <span className="wt-banner-note">{form.coverUrl ? '썸네일이 없어서 표지를 대신 보여 주고 있어요 · 눌러서 썸네일 올리기' : '눌러서 썸네일 올리기'}</span>}
          </WebtoonBanner>
        )} />
      <p className="field-hint">썸네일은 작품 페이지 맨 위 배너를 꽉 채워서 보여요. 가로 3:1 비율(예: 1500×500)로 맞추면 잘리는 부분 없이 그대로 들어가요. 사진을 고르면 3:1로 자르는 창이 열려요.</p>
    </div>
  );
}

export default function WebtoonManage() {
  const { id } = useParams();
  const toast = useToast();
  const nav = useNavigate();
  const [data, setData] = useState(null);
  const [form, setForm] = useState(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [newEp, setNewEp] = useState(false);
  const [epTitle, setEpTitle] = useState('');

  async function load() {
    try {
      const r = await api.get(`/webtoons/${id}/manage`);
      setData(r);
      setForm({ title: r.webtoon.title, genre: r.webtoon.genre, description: r.webtoon.description, visibility: r.webtoon.visibility, coverUrl: r.webtoon.coverUrl, thumbnailUrl: r.webtoon.ownThumbnailUrl, bannerColor: r.webtoon.bannerColor || '' });
    } catch (e) { setError(e.message); }
  }
  useEffect(() => { load(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function save(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.patch(`/webtoons/${id}`, form);
      toast.success('작품 정보를 저장했어요.');
      await load();
    } catch (err) { toast.error(err); } finally { setSaving(false); }
  }

  async function createEpisode(e) {
    e?.preventDefault();
    if (!epTitle.trim()) return;
    try {
      const r = await api.post(`/webtoons/${id}/episodes`, { title: epTitle });
      nav(`/projects/episodes/${r.episode.id}`);
    } catch (err) { toast.error(err); }
  }

  async function removeEpisode(ep) {
    if (!window.confirm(`${ep.number}화 「${ep.title}」을(를) 삭제할까요? 댓글과 좋아요도 함께 삭제되며 되돌릴 수 없어요.`)) return;
    try { await api.del(`/episodes/${ep.id}`); toast.success('회차를 삭제했어요.'); load(); } catch (err) { toast.error(err); }
  }
  async function cancelSchedule(ep) {
    if (!window.confirm('예약을 취소하고 임시저장 상태로 되돌릴까요?')) return;
    try { await api.post(`/episodes/${ep.id}/cancel-schedule`); toast.success('예약을 취소했어요.'); load(); } catch (err) { toast.error(err); }
  }
  async function removeWebtoon() {
    if (window.prompt(`작품과 모든 회차가 영구 삭제됩니다. 계속하려면 작품 제목 「${data.webtoon.title}」을 입력하세요.`) !== data.webtoon.title) return;
    try { await api.del(`/webtoons/${id}`); toast.success('웹툰을 삭제했어요.'); nav('/projects'); } catch (err) { toast.error(err); }
  }

  if (error) return <div className="page"><Empty title={error} action={<Link className="btn" to="/projects">프로젝트로</Link>} /></div>;
  if (!data || !form) return <Spinner />;
  const w = data.webtoon;
  const needsPublic = form.visibility !== 'public';

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <Link to="/projects" className="back-link"><Icon name="chevronL" size={16} /> 프로젝트</Link>
          <h1>{w.title}</h1>
          <p className="muted">공개 회차 {w.publishedEpisodeCount}개 · 조회 {fmtNum(w.viewCount)} · 좋아요 {fmtNum(w.likeCount)} · 관심 {fmtNum(w.bookmarkCount)}</p>
        </div>
        <div className="row-gap">
          {w.publishedEpisodeCount > 0 && w.visibility === 'public' && <Link className="btn" to={`/webtoons/${w.id}`}>감상 화면 보기</Link>}
          <button type="button" className="btn btn-primary" onClick={() => { setEpTitle(`${(data.episodes[0]?.number || 0) + 1}화`); setNewEp(true); }}><Icon name="plus" size={16} /> 새 회차</button>
        </div>
      </div>
      {w.hidden && <p className="notice notice-warn">이 작품은 관리자에 의해 숨김 처리되어 다른 사용자에게 보이지 않아요.</p>}

      <div className="manage-grid">
        <form className="panel" onSubmit={save}>
          <h2>작품 설정</h2>
          <BannerPicker form={form} setForm={setForm} />
          <div className="pickers pickers-cover">
            <ImagePicker label="표지 (세로형 · 목록용)" kind="cover" ratio="3 / 4" cropRatio={3 / 4} drawIndex={0} value={form.coverUrl} onChange={(v) => setForm((f) => ({ ...f, coverUrl: v }))} />
            <p className="field-hint">표지는 웹툰 목록과 홈 화면 카드에 세로로 보여요. 권장 비율 3:4 또는 2:3 (예: 900×1200).</p>
          </div>
          <Field label="제목" htmlFor="m-t"><input id="m-t" className="input" maxLength={60} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
          <Field label="장르">
            <select className="input" value={form.genre} onChange={(e) => setForm({ ...form, genre: e.target.value })}>
              {GENRES.map((g) => <option key={g}>{g}</option>)}
            </select>
          </Field>
          <Field label="작품 소개" htmlFor="m-d" hint={`${form.description.length}/2000`}>
            <textarea id="m-d" className="input" rows={5} maxLength={2000} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </Field>
          <Field label="공개 설정">
            <div className="seg">
              <button type="button" className={form.visibility === 'public' ? 'on' : ''} onClick={() => setForm({ ...form, visibility: 'public' })}>공개</button>
              <button type="button" className={form.visibility === 'private' ? 'on' : ''} onClick={() => setForm({ ...form, visibility: 'private' })}>비공개</button>
            </div>
          </Field>
          {needsPublic && <p className="field-hint">비공개 작품은 회차를 업로드해도 나만 볼 수 있어요. 독자에게 보여 주려면 ‘공개’로 바꾸고 저장하세요.</p>}
          <button type="submit" className="btn btn-primary btn-block" disabled={saving}>{saving ? '저장 중…' : '설정 저장'}</button>
          <button type="button" className="btn btn-ghost btn-danger-text btn-block" onClick={removeWebtoon}>작품 삭제</button>
        </form>

        <section className="panel">
          <h2>회차 관리</h2>
          {data.episodes.length === 0 && <Empty title="아직 회차가 없어요" action={<button type="button" className="btn btn-primary" onClick={() => { setEpTitle('1화'); setNewEp(true); }}>1화 그리기</button>} />}
          <ul className="manage-eps">
            {data.episodes.map((ep) => (
              <li key={ep.id}>
                <div className="ep-thumb sm">{ep.thumbnailUrl ? <img src={ep.thumbnailUrl} alt="" /> : <span>{ep.number}</span>}</div>
                <div className="ep-main">
                  <strong>{epLabel(ep)}</strong>
                  <span className="muted">
                    <EpisodeStatus ep={ep} />{' '}
                    {ep.status === 'published' && `${fmtDate(ep.publishedAt)} · 조회 ${fmtNum(ep.viewCount)} · 댓글 ${ep.commentCount}`}
                    {ep.status === 'scheduled' && `${fmtDate(ep.publishAt, true)} 공개 예정`}
                    {ep.status === 'draft' && `${ep.pageCount}장 · ${fmtDate(ep.updatedAt, true)} 저장`}
                  </span>
                </div>
                <div className="row-gap">
                  <Link className="btn btn-sm" to={`/projects/episodes/${ep.id}`}><Icon name="edit" size={14} /> 편집</Link>
                  {ep.status !== 'draft' && <Link className="btn btn-sm btn-ghost" to={`/episodes/${ep.id}`}>보기</Link>}
                  {ep.status === 'scheduled' && <button type="button" className="btn btn-sm btn-ghost" onClick={() => cancelSchedule(ep)}>예약 취소</button>}
                  <button type="button" className="icon-btn" onClick={() => removeEpisode(ep)} aria-label="회차 삭제"><Icon name="trash" size={16} /></button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <Modal open={newEp} title="새 회차" onClose={() => setNewEp(false)}
        footer={<><button type="button" className="btn" onClick={() => setNewEp(false)}>취소</button><button type="button" className="btn btn-primary" onClick={createEpisode} disabled={!epTitle.trim()}>편집기 열기</button></>}>
        <form onSubmit={createEpisode}>
          <Field label="회차 제목" htmlFor="ep-t"><input id="ep-t" className="input" maxLength={80} value={epTitle} onChange={(e) => setEpTitle(e.target.value)} /></Field>
          <p className="field-hint">회차는 임시저장 상태로 만들어지고, 편집기에서 업로드할 때 즉시 공개하거나 예약할 수 있어요.</p>
        </form>
      </Modal>
    </div>
  );
}
