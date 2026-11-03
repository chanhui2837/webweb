import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { Icon, Spinner } from './ui.jsx';
import { useToast } from '../context/ToastContext.jsx';

const Editor = lazy(() => import('../editor/Editor.jsx'));

export const DRAW_SIZES = [
  { l: '3:4 세로 (권장)', w: 900, h: 1200 },
  { l: '2:3 세로', w: 800, h: 1200 },
  { l: '1:1 정사각', w: 1000, h: 1000 },
  { l: '4:3 가로', w: 1200, h: 900 },
  { l: '16:9 가로', w: 1280, h: 720 },
];

/**
 * 그 자리에서 직접 그려 이미지 만들기 (표지·썸네일용)
 * onDone(blob) 에서 업로드한다. 웹툰 편집기의 모든 도구(말풍선·레이어 등)를 그대로 쓸 수 있다.
 */
export default function DrawImageModal({ open, title = '직접 그리기', defaultIndex = 0, onCancel, onDone }) {
  const toast = useToast();
  const editorRef = useRef(null);
  const [size, setSize] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) { setSize(null); setDirty(false); return undefined; }
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  if (!open) return null;

  const close = () => {
    if (busy) return;
    if (size && dirty && !window.confirm('그린 내용이 사라져요. 닫을까요?')) return;
    onCancel();
  };

  async function finish() {
    setBusy(true);
    try {
      const { blob, width, height } = await editorRef.current.renderBlob();
      await onDone(blob, { width, height });
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="draw-modal" role="dialog" aria-modal="true" aria-label={title}>
      <header className="ed-header">
        <button type="button" className="icon-btn" onClick={close} aria-label="닫기"><Icon name="x" /></button>
        <div className="ed-title">
          <span>그림판</span>
          <strong className="draw-title">{title}</strong>
        </div>
        {size && (
          <div className="ed-actions">
            <button type="button" className="btn btn-sm" onClick={() => { if (!dirty || window.confirm('지금 그린 내용을 지우고 크기를 다시 고를까요?')) { setSize(null); setDirty(false); } }} disabled={busy}>크기 다시 고르기</button>
            <button type="button" className="btn btn-sm btn-primary" onClick={finish} disabled={busy}>{busy ? '올리는 중…' : '이 그림 사용'}</button>
          </div>
        )}
      </header>
      {!size ? (
        <div className="draw-pick">
          <h2>캔버스 비율을 골라 주세요</h2>
          <div className="draw-sizes">
            {DRAW_SIZES.map((s, i) => (
              <button key={s.l} type="button" className={`draw-size ${i === defaultIndex ? 'rec' : ''}`} onClick={() => setSize(s)}>
                <span className="draw-size-box" style={{ aspectRatio: `${s.w} / ${s.h}` }} />
                <strong>{s.l}</strong>
                <small>{s.w}×{s.h}</small>
              </button>
            ))}
          </div>
          <p className="muted small">말풍선·텍스트·장식·레이어 등 웹툰 편집기 도구를 모두 쓸 수 있어요.</p>
        </div>
      ) : (
        <div className="ed-body">
          <div className="ed-main">
            <Suspense fallback={<Spinner />}>
              <Editor ref={editorRef} key={`${size.w}x${size.h}`} data={null} defaultSize={{ w: size.w, h: size.h }} onDirtyChange={setDirty} />
            </Suspense>
          </div>
        </div>
      )}
    </div>
  );
}
