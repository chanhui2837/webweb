import { useEffect, useRef, useState } from 'react';
import { Modal } from './ui.jsx';

export const RATIOS = [
  { v: 3 / 4, l: '3:4', hint: '권장' },
  { v: 2 / 3, l: '2:3' },
  { v: 1, l: '1:1' },
  { v: 4 / 3, l: '4:3' },
  { v: 16 / 9, l: '16:9' },
  { v: 0, l: '원본' },
];

/**
 * 비율 맞춰 자르기. 드래그로 위치, 슬라이더·휠·두 손가락으로 확대.
 * src: 이미지 주소(object URL 또는 업로드된 주소)
 * onDone(blob): 잘린 이미지
 */
export default function ImageCropper({ open, src, title = '비율 조정', defaultRatio = 3 / 4, maxOut = 1600, onCancel, onDone }) {
  const [img, setImg] = useState(null);
  const [ratio, setRatio] = useState(defaultRatio);
  const [zoom, setZoom] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [stageW, setStageW] = useState(360);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const wrapRef = useRef(null);
  const drag = useRef(null);
  const pointers = useRef(new Map());

  useEffect(() => {
    if (!open || !src) return;
    setImg(null); setError(''); setZoom(1); setRatio(defaultRatio);
    const im = new Image();
    if (!src.startsWith('blob:') && !src.startsWith('data:')) im.crossOrigin = 'anonymous';
    im.onload = () => setImg(im);
    im.onerror = () => setError('이미지를 불러오지 못했어요.');
    im.src = src;
  }, [open, src, defaultRatio]);

  useEffect(() => {
    if (!open) return undefined;
    const measure = () => setStageW(Math.min(440, (wrapRef.current?.clientWidth || 360)));
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [open, img]);

  const r = ratio || (img ? img.naturalWidth / img.naturalHeight : 3 / 4);
  // 화면 높이의 55% 를 넘지 않게 틀 크기 결정
  const maxH = Math.max(220, Math.round((window.visualViewport?.height || window.innerHeight) * 0.55));
  let fw = stageW;
  let fh = fw / r;
  if (fh > maxH) { fh = maxH; fw = fh * r; }
  const minScale = img ? Math.max(fw / img.naturalWidth, fh / img.naturalHeight) : 1;
  const scale = minScale * zoom;
  const iw = img ? img.naturalWidth * scale : 0;
  const ih = img ? img.naturalHeight * scale : 0;
  const clamp = (p) => ({ x: Math.min(0, Math.max(fw - iw, p.x)), y: Math.min(0, Math.max(fh - ih, p.y)) });

  // 비율·확대가 바뀌면 가운데 기준으로 다시 맞춤
  const centerKey = `${r}|${fw}|${img ? 1 : 0}`;
  const lastKey = useRef('');
  useEffect(() => {
    if (!img || lastKey.current === centerKey) return;
    lastKey.current = centerKey;
    setZoom(1);
    const s = Math.max(fw / img.naturalWidth, fh / img.naturalHeight);
    setPos({ x: (fw - img.naturalWidth * s) / 2, y: (fh - img.naturalHeight * s) / 2 });
  }, [centerKey]); // eslint-disable-line react-hooks/exhaustive-deps

  function zoomTo(z, cx = fw / 2, cy = fh / 2) {
    const nz = Math.min(5, Math.max(1, z));
    const ns = minScale * nz;
    // (cx,cy) 지점이 고정되도록 위치 보정
    const ix = (cx - pos.x) / scale;
    const iy = (cy - pos.y) / scale;
    const np = { x: cx - ix * ns, y: cy - iy * ns };
    setZoom(nz);
    setPos({ x: Math.min(0, Math.max(fw - img.naturalWidth * ns, np.x)), y: Math.min(0, Math.max(fh - img.naturalHeight * ns, np.y)) });
  }

  function onDown(e) {
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      drag.current = { pinch: Math.hypot(a.x - b.x, a.y - b.y), zoom };
    } else {
      drag.current = { sx: e.clientX, sy: e.clientY, px: pos.x, py: pos.y };
    }
  }
  function onMove(e) {
    if (!drag.current || !pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (drag.current.pinch && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()];
      const rect = e.currentTarget.getBoundingClientRect();
      zoomTo(drag.current.zoom * (Math.hypot(a.x - b.x, a.y - b.y) / drag.current.pinch), (a.x + b.x) / 2 - rect.left, (a.y + b.y) / 2 - rect.top);
      return;
    }
    if (drag.current.pinch) return;
    setPos(clamp({ x: drag.current.px + (e.clientX - drag.current.sx), y: drag.current.py + (e.clientY - drag.current.sy) }));
  }
  function onUp(e) {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size === 0) drag.current = null;
  }
  function onWheel(e) {
    if (!img) return;
    const rect = e.currentTarget.getBoundingClientRect();
    zoomTo(zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1), e.clientX - rect.left, e.clientY - rect.top);
  }

  async function done() {
    if (!img) return;
    setBusy(true);
    try {
      const sx = -pos.x / scale;
      const sy = -pos.y / scale;
      const sw = fw / scale;
      const sh = fh / scale;
      const outW = Math.round(Math.min(maxOut * Math.min(1, r), Math.max(300, sw)));
      const outH = Math.round(outW / r);
      const c = document.createElement('canvas');
      c.width = outW;
      c.height = outH;
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, outW, outH);
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, outW, outH);
      const blob = await new Promise((res) => c.toBlob(res, 'image/jpeg', 0.92));
      if (!blob) throw new Error('이미지를 만들지 못했어요.');
      await onDone(blob, { width: outW, height: outH });
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} title={title} onClose={() => !busy && onCancel()}
      footer={<><button type="button" className="btn" onClick={onCancel} disabled={busy}>취소</button><button type="button" className="btn btn-primary" onClick={done} disabled={!img || busy}>{busy ? '올리는 중…' : '이대로 사용'}</button></>}>
      <div className="crop-ratios" role="radiogroup" aria-label="비율">
        {RATIOS.map((x) => (
          <button key={x.l} type="button" role="radio" aria-checked={ratio === x.v} className={ratio === x.v ? 'on' : ''} onClick={() => setRatio(x.v)}>
            {x.l}{x.hint && <small> {x.hint}</small>}
          </button>
        ))}
      </div>
      <div className="crop-wrap" ref={wrapRef}>
        {error && <p className="form-error">{error}</p>}
        {!img && !error && <div className="crop-loading">불러오는 중…</div>}
        {img && (
          <div className="crop-stage" style={{ width: fw, height: fh }}
            onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onWheel={onWheel}>
            <img src={img.src} alt="" draggable={false} style={{ width: iw, height: ih, transform: `translate(${pos.x}px, ${pos.y}px)` }} />
            <span className="crop-grid" aria-hidden="true" />
          </div>
        )}
      </div>
      {img && (
        <label className="crop-zoom">
          <span>확대</span>
          <input type="range" min="1" max="5" step="0.01" value={zoom} onChange={(e) => zoomTo(Number(e.target.value))} aria-label="확대" />
        </label>
      )}
      <p className="field-hint">사진을 끌어서 위치를 맞추고, 확대 막대나 두 손가락으로 크기를 조절하세요.</p>
    </Modal>
  );
}
