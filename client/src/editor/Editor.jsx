import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import {
  applyResize,
  BUBBLE_STYLES,
  canvasToBlob,
  createItem,
  DECOR_SHAPES,
  drawItem,
  emptyDoc,
  FONTS,
  handlePoints,
  hitItem,
  loadImage,
  PAGE_PRESETS,
  PANEL_LAYOUTS,
  panelLayout,
  uid,
} from './core.js';
import { api } from '../lib/api.js';
import { useToast } from '../context/ToastContext.jsx';

const SWATCHES = ['#111111', '#555a6e', '#ffffff', '#2F4BFF', '#FF4F8B', '#FFD23F', '#21B573', '#FF7A1A', '#8E5CFF', '#9C6B3C'];
const MAX_HISTORY = 50;
const MAX_LAYERS = 30;

const TOOLS = [
  { v: 'select', l: '선택', key: 'V', icon: 'M5 3l13 8-6 1.5L9 19z' },
  { v: 'hand', l: '화면 이동', key: 'H', icon: 'M8 13V5.5a1.5 1.5 0 0 1 3 0V12m0-1.5V4a1.5 1.5 0 0 1 3 0v7m0-5.5a1.5 1.5 0 0 1 3 0V13m0-4a1.5 1.5 0 0 1 3 0v6a6 6 0 0 1-6 6h-2a6 6 0 0 1-5-2.7L4 15.5a1.6 1.6 0 0 1 2.6-1.9L8 15' },
  { v: 'brush', l: '브러시', key: 'B', icon: 'M14 4l6 6-8.5 8.5a3 3 0 0 1-2 .9L5 20l.6-4.5a3 3 0 0 1 .9-2zM12 6l6 6' },
  { v: 'eraser', l: '지우개', key: 'E', icon: 'M8 20h12M5.5 14.5l8-8a2 2 0 0 1 2.8 0l2.2 2.2a2 2 0 0 1 0 2.8L12 18H8.5z' },
  { v: 'bubble', l: '말풍선', key: 'U', icon: 'M4 5h16v11H9l-5 4z' },
  { v: 'text', l: '텍스트', key: 'T', icon: 'M5 6V4h14v2M12 4v16M9 20h6' },
  { v: 'frame', l: '컷 프레임', key: 'F', icon: 'M3 4h8v7H3zM13 4h8v16h-8zM3 13h8v7H3z' },
  { v: 'speed', l: '효과선', key: 'S', icon: 'M3 7h12M6 11h15M3 15h10M8 19h13' },
  { v: 'focus', l: '집중선', key: 'G', icon: 'M12 2v6M12 16v6M2 12h6M16 12h6M5 5l4 4M15 15l4 4M19 5l-4 4M9 15l-4 4' },
  { v: 'decor', l: '장식·배경', key: 'D', icon: 'M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.8z' },
];

function Ico({ d, size = 20 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>;
}

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}
function cloneCanvas(src) {
  const c = makeCanvas(src.width, src.height);
  c.getContext('2d').drawImage(src, 0, 0);
  return c;
}
const clone = (o) => JSON.parse(JSON.stringify(o));

/**
 * 웹툰/일러스트 공용 캔버스 편집기.
 * ref API: getData(), isDirty(), markSaved(), renderBlob(), thumbnail()
 */
const Editor = forwardRef(function Editor({ data, defaultSize, onDirtyChange, onReady }, ref) {
  const toast = useToast();
  const viewRef = useRef(null);
  const scrollRef = useRef(null);
  const docRef = useRef(null);
  const histRef = useRef({ list: [], index: -1 });
  const scratchRef = useRef(null);
  const strokeRef = useRef(null);
  const dragRef = useRef(null);
  const rafRef = useRef(0);
  const dirtyRef = useRef(false);
  const debounceRef = useRef(0);
  const spaceRef = useRef(false);
  const fileRef = useRef(null);

  const [, setVer] = useState(0);
  const bump = () => setVer((v) => v + 1);
  const [ready, setReady] = useState(false);
  const [tool, setTool] = useState('brush');
  const [color, setColor] = useState('#111111');
  const [size, setSize] = useState(6);
  const [eraserSize, setEraserSize] = useState(24);
  const [brushOpacity, setBrushOpacity] = useState(1);
  const [pressure, setPressure] = useState(true);
  const [zoom, setZoom] = useState(0.5);
  const [activeLayerId, setActiveLayerId] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [bubbleStyle, setBubbleStyle] = useState('round');
  const [decorShape, setDecorShape] = useState('star');
  const [panel, setPanel] = useState('props');
  const [panelOpen, setPanelOpen] = useState(false);
  const [sizeForm, setSizeForm] = useState({ w: 800, h: 1280 });

  const setDirty = useCallback((v) => {
    if (dirtyRef.current !== v) { dirtyRef.current = v; onDirtyChange?.(v); }
  }, [onDirtyChange]);

  /* ---------------- 렌더링 ---------------- */
  const composite = useCallback((ctx, { overlay = false } = {}) => {
    const doc = docRef.current;
    if (!doc) return;
    ctx.save();
    ctx.clearRect(0, 0, doc.width, doc.height);
    if (doc.background) { ctx.fillStyle = doc.background; ctx.fillRect(0, 0, doc.width, doc.height); }
    const st = strokeRef.current;
    for (const l of doc.layers) {
      if (!l.visible) continue;
      ctx.save();
      ctx.globalAlpha = l.opacity;
      if (overlay && st && st.layerId === l.id) {
        // 진행 중인 획을 미리보기로 합성
        const sc = scratchRef.current;
        const sctx = sc.getContext('2d');
        sctx.clearRect(0, 0, sc.width, sc.height);
        sctx.globalCompositeOperation = 'source-over';
        sctx.globalAlpha = 1;
        sctx.drawImage(l.canvas, 0, 0);
        sctx.globalCompositeOperation = st.erase ? 'destination-out' : 'source-over';
        sctx.globalAlpha = st.erase ? 1 : st.opacity;
        sctx.drawImage(st.canvas, 0, 0);
        sctx.globalCompositeOperation = 'source-over';
        sctx.globalAlpha = 1;
        ctx.drawImage(sc, 0, 0);
      } else {
        ctx.drawImage(l.canvas, 0, 0);
      }
      for (const it of l.items) drawItem(ctx, it, () => scheduleRender());
      ctx.restore();
    }
    ctx.restore();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const renderNow = useCallback(() => {
    rafRef.current = 0;
    const c = viewRef.current;
    const doc = docRef.current;
    if (!c || !doc) return;
    const ctx = c.getContext('2d');
    composite(ctx, { overlay: true });
    // 선택 표시
    const sel = findItem(selectedIdRef.current);
    if (sel) {
      const it = sel.item;
      const z = zoomRef.current;
      const hs = 6 / z;
      ctx.save();
      ctx.strokeStyle = '#2F4BFF';
      ctx.lineWidth = 1.5 / z;
      ctx.setLineDash([6 / z, 4 / z]);
      ctx.strokeRect(it.x, it.y, it.w, it.h);
      ctx.setLineDash([]);
      for (const [name, x, y] of handlePoints(it)) {
        ctx.fillStyle = name === 'tail' ? '#FFD23F' : '#ffffff';
        ctx.strokeStyle = '#2F4BFF';
        ctx.beginPath();
        if (name === 'tail') ctx.arc(x, y, hs * 1.2, 0, Math.PI * 2); else ctx.rect(x - hs, y - hs, hs * 2, hs * 2);
        ctx.fill();
        ctx.stroke();
      }
      ctx.restore();
    }
  }, [composite]); // eslint-disable-line react-hooks/exhaustive-deps

  function scheduleRender() {
    if (!rafRef.current) rafRef.current = requestAnimationFrame(renderNow);
  }

  // 최신 값을 이벤트 핸들러에서 쓰기 위한 ref
  const selectedIdRef = useRef(null);
  const zoomRef = useRef(zoom);
  const toolRef = useRef(tool);
  const activeRef = useRef(null);
  useEffect(() => { selectedIdRef.current = selectedId; scheduleRender(); }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { zoomRef.current = zoom; scheduleRender(); }, [zoom]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { toolRef.current = tool; }, [tool]);
  useEffect(() => { activeRef.current = activeLayerId; }, [activeLayerId]);

  function findItem(id) {
    if (!id || !docRef.current) return null;
    for (const l of docRef.current.layers) {
      const idx = l.items.findIndex((i) => i.id === id);
      if (idx >= 0) return { layer: l, item: l.items[idx], index: idx };
    }
    return null;
  }
  const activeLayer = () => docRef.current?.layers.find((l) => l.id === activeRef.current) || docRef.current?.layers[docRef.current.layers.length - 1];

  /* ---------------- 히스토리 ---------------- */
  function snapshot() {
    const d = docRef.current;
    return {
      width: d.width, height: d.height, background: d.background, active: activeRef.current,
      layers: d.layers.map((l) => ({ id: l.id, name: l.name, visible: l.visible, opacity: l.opacity, hasPixels: l.hasPixels, snap: l.snap, items: clone(l.items) })),
    };
  }
  function pushHistory() {
    const h = histRef.current;
    h.list = h.list.slice(0, h.index + 1);
    h.list.push(snapshot());
    if (h.list.length > MAX_HISTORY) h.list.shift();
    h.index = h.list.length - 1;
    setDirty(true);
    bump();
  }
  function commitBitmap(layer) {
    layer.snap = cloneCanvas(layer.canvas);
  }
  function restore(s) {
    const d = docRef.current;
    const old = new Map(d.layers.map((l) => [l.id, l]));
    d.width = s.width;
    d.height = s.height;
    d.background = s.background;
    d.layers = s.layers.map((sl) => {
      let l = old.get(sl.id);
      if (!l || l.canvas.width !== s.width || l.canvas.height !== s.height) l = { canvas: makeCanvas(s.width, s.height) };
      const ctx = l.canvas.getContext('2d');
      ctx.clearRect(0, 0, s.width, s.height);
      ctx.drawImage(sl.snap, 0, 0);
      return { ...l, id: sl.id, name: sl.name, visible: sl.visible, opacity: sl.opacity, hasPixels: sl.hasPixels, snap: sl.snap, items: clone(sl.items) };
    });
    if (scratchRef.current.width !== s.width || scratchRef.current.height !== s.height) scratchRef.current = makeCanvas(s.width, s.height);
    const a = d.layers.find((l) => l.id === s.active) ? s.active : d.layers[d.layers.length - 1].id;
    setActiveLayerId(a);
    activeRef.current = a;
    if (!findItem(selectedIdRef.current)) setSelectedId(null);
    setSizeForm({ w: s.width, h: s.height });
    setDirty(true);
    bump();
    scheduleRender();
  }
  const undo = () => { const h = histRef.current; if (h.index > 0) { h.index -= 1; restore(h.list[h.index]); } };
  const redo = () => { const h = histRef.current; if (h.index < h.list.length - 1) { h.index += 1; restore(h.list[h.index]); } };

  /* ---------------- 불러오기 ---------------- */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setReady(false);
      const src = data && data.layers ? data : emptyDoc(defaultSize?.w, defaultSize?.h);
      const fonts = new Set();
      src.layers.forEach((l) => (l.items || []).forEach((it) => it.font && fonts.add(`${it.bold ? '800' : '500'} ${it.fontSize}px ${it.font}`)));
      await Promise.all([...fonts].map((f) => document.fonts?.load(f, '가A').catch(() => {})));
      const layers = [];
      for (const l of src.layers) {
        const canvas = makeCanvas(src.width, src.height);
        if (l.bitmap) {
          const img = await loadImage(l.bitmap);
          if (img) canvas.getContext('2d').drawImage(img, 0, 0);
        }
        for (const it of l.items || []) if (it.type === 'image') await loadImage(it.src);
        layers.push({ id: l.id || uid('l'), name: l.name || '레이어', visible: l.visible !== false, opacity: l.opacity ?? 1, hasPixels: !!l.bitmap, canvas, snap: null, items: clone(l.items || []) });
      }
      if (cancelled) return;
      layers.forEach(commitBitmap);
      docRef.current = { width: src.width, height: src.height, background: src.background ?? '#ffffff', layers };
      scratchRef.current = makeCanvas(src.width, src.height);
      const top = layers[layers.length - 1].id;
      activeRef.current = top;
      setActiveLayerId(top);
      setSelectedId(null);
      setSizeForm({ w: src.width, h: src.height });
      histRef.current = { list: [], index: -1 };
      histRef.current.list.push(snapshot());
      histRef.current.index = 0;
      dirtyRef.current = false;
      onDirtyChange?.(false);
      // 화면 너비에 맞춰 확대율 설정
      const vw = scrollRef.current?.clientWidth || 800;
      setZoom(Math.min(1, Math.max(0.1, Math.floor(((vw - 48) / src.width) * 20) / 20)));
      setReady(true);
      bump();
      scheduleRender();
      onReady?.();
    })();
    return () => { cancelled = true; };
  }, [data]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---------------- 외부 API ---------------- */
  useImperativeHandle(ref, () => ({
    isDirty: () => dirtyRef.current,
    markSaved: () => setDirty(false),
    getData() {
      const d = docRef.current;
      if (!d) return null;
      return {
        version: 1, width: d.width, height: d.height, background: d.background,
        layers: d.layers.map((l) => ({ id: l.id, name: l.name, visible: l.visible, opacity: l.opacity, bitmap: l.hasPixels ? l.canvas.toDataURL('image/png') : null, items: clone(l.items) })),
      };
    },
    async renderBlob() {
      const d = docRef.current;
      const c = makeCanvas(d.width, d.height);
      composite(c.getContext('2d'));
      const blob = await canvasToBlob(c);
      return { blob, width: d.width, height: d.height };
    },
    thumbnail(maxW = 160) {
      const d = docRef.current;
      if (!d) return '';
      const full = makeCanvas(d.width, d.height);
      composite(full.getContext('2d'));
      const s = maxW / d.width;
      const t = makeCanvas(maxW, Math.max(1, Math.round(d.height * s)));
      t.getContext('2d').drawImage(full, 0, 0, t.width, t.height);
      return t.toDataURL('image/jpeg', 0.7);
    },
  }), [composite, setDirty]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---------------- 포인터 ---------------- */
  function toDoc(e) {
    const r = viewRef.current.getBoundingClientRect();
    const d = docRef.current;
    return { x: ((e.clientX - r.left) / r.width) * d.width, y: ((e.clientY - r.top) / r.height) * d.height };
  }

  function onPointerDown(e) {
    if (!ready || e.button === 2) return;
    if (panelOpen) setPanelOpen(false);
    const d = docRef.current;
    const p = toDoc(e);
    const t = spaceRef.current || e.button === 1 ? 'hand' : toolRef.current;
    viewRef.current.setPointerCapture(e.pointerId);

    if (t === 'hand') {
      const s = scrollRef.current;
      dragRef.current = { kind: 'pan', sx: e.clientX, sy: e.clientY, sl: s.scrollLeft, st: s.scrollTop };
      return;
    }
    if (t === 'brush' || t === 'eraser') {
      const layer = activeLayer();
      if (!layer.visible) { toast.info('숨겨진 레이어에는 그릴 수 없어요. 눈 아이콘으로 레이어를 표시해 주세요.'); return; }
      const sc = makeCanvas(d.width, d.height);
      const erase = t === 'eraser';
      strokeRef.current = { canvas: sc, layerId: layer.id, erase, opacity: erase ? 1 : brushOpacity, last: p, lastMid: p, pts: 0 };
      const ctx = sc.getContext('2d');
      ctx.fillStyle = color;
      const w = (erase ? eraserSize : size) * (pressure && e.pointerType === 'pen' ? Math.max(0.15, e.pressure || 0.5) * 1.6 : 1);
      ctx.beginPath();
      ctx.arc(p.x, p.y, w / 2, 0, Math.PI * 2);
      ctx.fill();
      scheduleRender();
      return;
    }
    if (t === 'select') {
      const z = zoomRef.current;
      const tol = 9 / z;
      const sel = findItem(selectedIdRef.current);
      if (sel) {
        for (const [name, hx, hy] of handlePoints(sel.item)) {
          if (Math.abs(p.x - hx) <= tol && Math.abs(p.y - hy) <= tol) {
            dragRef.current = { kind: name === 'tail' ? 'tail' : 'resize', handle: name, start: p, orig: clone(sel.item), id: sel.item.id };
            return;
          }
        }
      }
      // 위쪽 레이어의 위쪽 아이템부터 판정
      for (let li = d.layers.length - 1; li >= 0; li -= 1) {
        const l = d.layers[li];
        if (!l.visible) continue;
        for (let ii = l.items.length - 1; ii >= 0; ii -= 1) {
          const it = l.items[ii];
          if (hitItem(it, p.x, p.y, 2 / z)) {
            setSelectedId(it.id);
            selectedIdRef.current = it.id;
            setActiveLayerId(l.id);
            activeRef.current = l.id;
            dragRef.current = { kind: 'move', start: p, orig: clone(it), id: it.id, moved: false };
            setPanel('props');
            scheduleRender();
            return;
          }
        }
      }
      setSelectedId(null);
      return;
    }
    // 아이템 배치 도구: 드래그로 영역 지정
    dragRef.current = { kind: 'place', start: p, cur: p, tool: t };
  }

  function onPointerMove(e) {
    const drag = dragRef.current;
    const st = strokeRef.current;
    if (!drag && !st) return;
    const p = toDoc(e);
    if (st) {
      const ctx = st.canvas.getContext('2d');
      const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
      for (const ev of evs.length ? evs : [e]) {
        const q = toDoc(ev);
        const w = (st.erase ? eraserSize : size) * (pressure && ev.pointerType === 'pen' ? Math.max(0.15, ev.pressure || 0.5) * 1.6 : 1);
        const mid = { x: (st.last.x + q.x) / 2, y: (st.last.y + q.y) / 2 };
        ctx.strokeStyle = color;
        ctx.lineWidth = w;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(st.lastMid.x, st.lastMid.y);
        ctx.quadraticCurveTo(st.last.x, st.last.y, mid.x, mid.y);
        ctx.stroke();
        st.last = q;
        st.lastMid = mid;
      }
      scheduleRender();
      return;
    }
    if (drag.kind === 'pan') {
      const s = scrollRef.current;
      s.scrollLeft = drag.sl - (e.clientX - drag.sx);
      s.scrollTop = drag.st - (e.clientY - drag.sy);
      return;
    }
    const found = findItem(drag.id);
    if (drag.kind === 'move' && found) {
      const dx = p.x - drag.start.x;
      const dy = p.y - drag.start.y;
      if (Math.abs(dx) + Math.abs(dy) > 0.5) drag.moved = true;
      Object.assign(found.item, { x: drag.orig.x + dx, y: drag.orig.y + dy });
      if (found.item.type === 'bubble') Object.assign(found.item, { tailX: drag.orig.tailX + dx, tailY: drag.orig.tailY + dy });
    } else if (drag.kind === 'resize' && found) {
      const keep = e.shiftKey || found.item.type === 'image';
      const r = applyResize(drag.orig, drag.handle, p.x - drag.start.x, p.y - drag.start.y, keep && !e.altKey);
      Object.assign(found.item, r);
      drag.moved = true;
    } else if (drag.kind === 'tail' && found) {
      Object.assign(found.item, { tailX: p.x, tailY: p.y });
      drag.moved = true;
    } else if (drag.kind === 'place') {
      drag.cur = p;
      // 배치 영역 미리보기
      scheduleRender();
      requestAnimationFrame(() => {
        const ctx = viewRef.current?.getContext('2d');
        if (!ctx || dragRef.current !== drag) return;
        ctx.save();
        ctx.strokeStyle = '#2F4BFF';
        ctx.lineWidth = 2 / zoomRef.current;
        ctx.setLineDash([8 / zoomRef.current, 6 / zoomRef.current]);
        ctx.strokeRect(Math.min(drag.start.x, p.x), Math.min(drag.start.y, p.y), Math.abs(p.x - drag.start.x), Math.abs(p.y - drag.start.y));
        ctx.restore();
      });
      return;
    }
    scheduleRender();
  }

  function onPointerUp() {
    const st = strokeRef.current;
    if (st) {
      const layer = docRef.current.layers.find((l) => l.id === st.layerId);
      if (layer) {
        const ctx = layer.canvas.getContext('2d');
        ctx.save();
        ctx.globalCompositeOperation = st.erase ? 'destination-out' : 'source-over';
        ctx.globalAlpha = st.erase ? 1 : st.opacity;
        ctx.drawImage(st.canvas, 0, 0);
        ctx.restore();
        layer.hasPixels = true;
        commitBitmap(layer);
      }
      strokeRef.current = null;
      pushHistory();
      scheduleRender();
      return;
    }
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag) return;
    if (drag.kind === 'place') {
      placeItem(drag.tool, drag.start, drag.cur);
      return;
    }
    if (drag.moved) pushHistory();
    scheduleRender();
  }

  function placeItem(t, a, b) {
    const d = docRef.current;
    let x = Math.min(a.x, b.x);
    let y = Math.min(a.y, b.y);
    let w = Math.abs(b.x - a.x);
    let h = Math.abs(b.y - a.y);
    const defaults = { bubble: [d.width * 0.42, d.width * 0.26], text: [d.width * 0.4, 70], frame: [d.width * 0.8, d.height * 0.3], speed: [d.width * 0.6, d.width * 0.4], focus: [d.width, Math.min(d.height, d.width * 1.1)], decor: [120, 120] };
    if (w < 12 || h < 12) {
      [w, h] = defaults[t] || [150, 100];
      x = a.x - w / 2;
      y = a.y - h / 2;
    }
    const extra = t === 'bubble' ? { style: bubbleStyle, fontSize: Math.round(Math.max(18, d.width / 30)), strokeWidth: bubbleStyle === 'box' ? 2.5 : 3, tail: bubbleStyle !== 'box' } : t === 'decor' ? { shape: decorShape, ...(decorShape === 'tone' ? { fill: '#111111', strokeWidth: 3 } : {}), ...(decorShape === 'gradient' ? { fill: color, color2: 'rgba(255,255,255,0)' } : {}) } : t === 'text' ? { color, fontSize: Math.round(Math.max(20, d.width / 25)) } : (t === 'speed' || t === 'focus') ? { color } : {};
    const it = createItem(t, x, y, w, h, extra);
    if (t === 'bubble') { it.tailX = x + w * 0.3; it.tailY = y + h + Math.max(30, h * 0.45); }
    addItems([it]);
  }

  function addItems(items) {
    const layer = activeLayer();
    const used = docRef.current.layers.reduce((s, l) => s + l.items.length, 0);
    if (used + items.length > 400) { toast.error('아이템은 최대 400개까지 넣을 수 있어요.'); return; }
    if (!layer.visible) layer.visible = true;
    layer.items.push(...items);
    const last = items[items.length - 1];
    setSelectedId(last.id);
    selectedIdRef.current = last.id;
    setTool('select');
    setPanel('props');
    pushHistory();
    scheduleRender();
  }

  /* ---------------- 아이템 편집 ---------------- */
  function updateItem(patch, commit = 'now') {
    const f = findItem(selectedIdRef.current);
    if (!f) return;
    Object.assign(f.item, patch);
    scheduleRender();
    bump();
    clearTimeout(debounceRef.current);
    if (commit === 'now') pushHistory();
    else debounceRef.current = setTimeout(pushHistory, 600);
  }
  function deleteSelected() {
    const f = findItem(selectedIdRef.current);
    if (!f) return;
    f.layer.items.splice(f.index, 1);
    setSelectedId(null);
    pushHistory();
    scheduleRender();
  }
  function duplicateSelected() {
    const f = findItem(selectedIdRef.current);
    if (!f) return;
    const c = { ...clone(f.item), id: uid(), x: f.item.x + 24, y: f.item.y + 24 };
    if (c.type === 'bubble') { c.tailX += 24; c.tailY += 24; }
    if (c.seed) c.seed = Math.floor(Math.random() * 1e9);
    f.layer.items.splice(f.index + 1, 0, c);
    setSelectedId(c.id);
    selectedIdRef.current = c.id;
    pushHistory();
    scheduleRender();
  }
  function reorder(dir) {
    const f = findItem(selectedIdRef.current);
    if (!f) return;
    const arr = f.layer.items;
    const [it] = arr.splice(f.index, 1);
    let to = f.index;
    if (dir === 'up') to = Math.min(arr.length, f.index + 1);
    if (dir === 'down') to = Math.max(0, f.index - 1);
    if (dir === 'top') to = arr.length;
    if (dir === 'bottom') to = 0;
    arr.splice(to, 0, it);
    pushHistory();
    scheduleRender();
  }
  function setTailDir(dir) {
    const f = findItem(selectedIdRef.current);
    if (!f) return;
    const it = f.item;
    const off = Math.max(30, it.h * 0.45);
    const pos = {
      bl: [it.x + it.w * 0.28, it.y + it.h + off], br: [it.x + it.w * 0.72, it.y + it.h + off],
      tl: [it.x + it.w * 0.28, it.y - off], tr: [it.x + it.w * 0.72, it.y - off],
      l: [it.x - off, it.y + it.h * 0.6], r: [it.x + it.w + off, it.y + it.h * 0.6],
    }[dir];
    updateItem({ tail: true, tailX: pos[0], tailY: pos[1] });
  }

  /* ---------------- 이미지 불러오기 ---------------- */
  async function importImage(e) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    if (!/^image\/(png|jpeg|webp|gif)$/.test(f.type)) { toast.error('PNG, JPG, WEBP, GIF 이미지만 불러올 수 있어요.'); return; }
    if (f.size > 10 * 1024 * 1024) { toast.error('이미지는 10MB 이하만 불러올 수 있어요.'); return; }
    try {
      toast.info('이미지를 올리는 중…');
      const r = await api.upload('/uploads/image?kind=editor', f);
      const img = await loadImage(r.url);
      if (!img) throw new Error('이미지를 불러오지 못했어요.');
      const d = docRef.current;
      const s = Math.min(1, (d.width * 0.9) / img.naturalWidth, (d.height * 0.9) / img.naturalHeight);
      const w = img.naturalWidth * s;
      const h = img.naturalHeight * s;
      const z = zoomRef.current;
      const sc = scrollRef.current;
      const cy = Math.min(d.height - h, Math.max(0, (sc.scrollTop + sc.clientHeight / 2) / z - h / 2));
      addItems([createItem('image', (d.width - w) / 2, cy, w, h, { src: r.url })]);
    } catch (err) { toast.error(err); }
  }

  /* ---------------- 레이어 ---------------- */
  function addLayer() {
    const d = docRef.current;
    if (d.layers.length >= MAX_LAYERS) { toast.error(`레이어는 최대 ${MAX_LAYERS}개까지 만들 수 있어요.`); return; }
    const l = { id: uid('l'), name: `레이어 ${d.layers.length + 1}`, visible: true, opacity: 1, hasPixels: false, canvas: makeCanvas(d.width, d.height), items: [] };
    commitBitmap(l);
    const idx = d.layers.findIndex((x) => x.id === activeRef.current);
    d.layers.splice(idx + 1, 0, l);
    setActiveLayerId(l.id);
    activeRef.current = l.id;
    pushHistory();
    scheduleRender();
  }
  function deleteLayer(id) {
    const d = docRef.current;
    if (d.layers.length <= 1) { toast.info('레이어는 최소 1개가 있어야 해요.'); return; }
    if (!window.confirm('이 레이어를 삭제할까요? (실행 취소로 되돌릴 수 있어요)')) return;
    const idx = d.layers.findIndex((l) => l.id === id);
    d.layers.splice(idx, 1);
    const next = d.layers[Math.max(0, idx - 1)].id;
    setActiveLayerId(next);
    activeRef.current = next;
    if (!findItem(selectedIdRef.current)) setSelectedId(null);
    pushHistory();
    scheduleRender();
  }
  function moveLayer(id, dir) {
    const d = docRef.current;
    const idx = d.layers.findIndex((l) => l.id === id);
    const to = dir === 'up' ? idx + 1 : idx - 1;
    if (to < 0 || to >= d.layers.length) return;
    const [l] = d.layers.splice(idx, 1);
    d.layers.splice(to, 0, l);
    pushHistory();
    scheduleRender();
  }
  function patchLayer(id, patch, commit = 'now') {
    const l = docRef.current.layers.find((x) => x.id === id);
    if (!l) return;
    Object.assign(l, patch);
    scheduleRender();
    bump();
    clearTimeout(debounceRef.current);
    if (commit === 'now') pushHistory(); else debounceRef.current = setTimeout(pushHistory, 500);
  }
  function clearLayerPixels(id) {
    const l = docRef.current.layers.find((x) => x.id === id);
    if (!l || !window.confirm('이 레이어에 그린 그림(브러시)을 모두 지울까요? 말풍선 등 아이템은 남아요.')) return;
    l.canvas.getContext('2d').clearRect(0, 0, l.canvas.width, l.canvas.height);
    l.hasPixels = false;
    commitBitmap(l);
    pushHistory();
    scheduleRender();
  }
  function mergeDown(id) {
    const d = docRef.current;
    const idx = d.layers.findIndex((l) => l.id === id);
    if (idx <= 0) return;
    const top = d.layers[idx];
    const below = d.layers[idx - 1];
    const ctx = below.canvas.getContext('2d');
    ctx.save();
    ctx.globalAlpha = top.opacity / (below.opacity || 1);
    ctx.drawImage(top.canvas, 0, 0);
    ctx.restore();
    below.hasPixels = below.hasPixels || top.hasPixels;
    below.items.push(...top.items);
    commitBitmap(below);
    d.layers.splice(idx, 1);
    setActiveLayerId(below.id);
    activeRef.current = below.id;
    pushHistory();
    scheduleRender();
  }

  /* ---------------- 캔버스 크기 ---------------- */
  function resizeCanvas(w, h) {
    w = Math.round(Number(w));
    h = Math.round(Number(h));
    if (!(w >= 50 && w <= 4000 && h >= 50 && h <= 12000)) { toast.error('가로 50~4000px, 세로 50~12000px 사이로 입력해 주세요.'); return; }
    const d = docRef.current;
    if (w === d.width && h === d.height) return;
    if (w * h > 20000000) { toast.error('캔버스가 너무 커요. 가로×세로를 줄여 주세요.'); return; }
    d.layers.forEach((l) => {
      const c = makeCanvas(w, h);
      c.getContext('2d').drawImage(l.canvas, 0, 0);
      l.canvas = c;
      commitBitmap(l);
    });
    d.width = w;
    d.height = h;
    scratchRef.current = makeCanvas(w, h);
    setSizeForm({ w, h });
    pushHistory();
    scheduleRender();
  }
  function insertLayout(kind) {
    const d = docRef.current;
    const frames = panelLayout(kind, d.width, d.height, Math.round(d.width * 0.05), Math.round(d.width * 0.035), Math.max(3, Math.round(d.width / 140)));
    addItems(frames);
  }

  /* ---------------- 단축키 ---------------- */
  useEffect(() => {
    const onKey = (e) => {
      if (e.target.closest?.('input,textarea,select,[contenteditable]')) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
      if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
      if (mod && e.key.toLowerCase() === 'd') { e.preventDefault(); duplicateSelected(); return; }
      if (mod && (e.key === '=' || e.key === '+')) { e.preventDefault(); setZoom((z) => Math.min(4, +(z * 1.25).toFixed(2))); return; }
      if (mod && e.key === '-') { e.preventDefault(); setZoom((z) => Math.max(0.1, +(z / 1.25).toFixed(2))); return; }
      if (mod) return;
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedIdRef.current) { e.preventDefault(); deleteSelected(); return; }
      if (e.key === ' ') { spaceRef.current = true; e.preventDefault(); return; }
      if (e.key === 'Escape') { setSelectedId(null); return; }
      if (e.key === '[') { setSize((s) => Math.max(1, s - 2)); return; }
      if (e.key === ']') { setSize((s) => Math.min(120, s + 2)); return; }
      const t = TOOLS.find((x) => x.key.toLowerCase() === e.key.toLowerCase());
      if (t) setTool(t.v);
    };
    const onUp = (e) => { if (e.key === ' ') spaceRef.current = false; };
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onUp);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('keyup', onUp); };
  }); // 매 렌더마다 최신 클로저로 재등록

  // Ctrl + 휠 확대/축소
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return undefined;
    const onWheel = (e) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      setZoom((z) => Math.min(4, Math.max(0.1, +(z * (e.deltaY < 0 ? 1.1 : 1 / 1.1)).toFixed(3))));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  /* ---------------- UI ---------------- */
  const d = docRef.current;
  const sel = findItem(selectedId);
  const it = sel?.item;
  const h = histRef.current;
  const fitZoom = () => {
    const vw = scrollRef.current?.clientWidth || 800;
    setZoom(Math.min(4, Math.max(0.1, +((vw - 48) / d.width).toFixed(2))));
  };

  const num = (label, key, opts = {}) => (
    <label className="ed-num">
      <span>{label}</span>
      <input type="number" value={Math.round((it[key] ?? 0) * (opts.scale || 1))} min={opts.min} max={opts.max} step={opts.step || 1}
        onChange={(e) => updateItem({ [key]: Number(e.target.value) / (opts.scale || 1) }, 'debounce')} />
    </label>
  );
  const colorField = (label, key, allowNone = false) => (
    <label className="ed-color">
      <span>{label}</span>
      <span className="ed-color-row">
        <input type="color" value={/^#[0-9a-f]{6}$/i.test(it[key]) ? it[key] : '#ffffff'} onChange={(e) => updateItem({ [key]: e.target.value }, 'debounce')} />
        {allowNone && <button type="button" className={`ed-mini ${!it[key] ? 'on' : ''}`} onClick={() => updateItem({ [key]: '' })}>없음</button>}
      </span>
    </label>
  );

  const toolOptions = () => {
    if (tool === 'brush' || tool === 'eraser') {
      const isE = tool === 'eraser';
      return (
        <div className="ed-group">
          <h4>{isE ? '지우개' : '브러시'}</h4>
          {!isE && (
            <>
              <div className="ed-swatches">
                {SWATCHES.map((c) => <button key={c} type="button" className={color === c ? 'on' : ''} style={{ background: c }} onClick={() => setColor(c)} aria-label={`색상 ${c}`} />)}
                <input type="color" value={color} onChange={(e) => setColor(e.target.value)} aria-label="색상 직접 선택" />
              </div>
            </>
          )}
          <label className="ed-range"><span>크기 {isE ? eraserSize : size}px</span>
            <input type="range" min="1" max={isE ? 200 : 120} value={isE ? eraserSize : size} onChange={(e) => (isE ? setEraserSize : setSize)(Number(e.target.value))} />
          </label>
          {!isE && (
            <label className="ed-range"><span>불투명도 {Math.round(brushOpacity * 100)}%</span>
              <input type="range" min="5" max="100" value={Math.round(brushOpacity * 100)} onChange={(e) => setBrushOpacity(Number(e.target.value) / 100)} />
            </label>
          )}
          <label className="ed-check"><input type="checkbox" checked={pressure} onChange={(e) => setPressure(e.target.checked)} /> 펜 필압 사용</label>
          <p className="ed-hint">[ / ] 키로 크기 조절 · 스페이스를 누른 채 드래그하면 화면 이동</p>
        </div>
      );
    }
    if (tool === 'bubble') {
      return (
        <div className="ed-group">
          <h4>말풍선 종류</h4>
          <div className="ed-grid2">
            {BUBBLE_STYLES.map((b) => <button key={b.v} type="button" className={`ed-btn ${bubbleStyle === b.v ? 'on' : ''}`} onClick={() => setBubbleStyle(b.v)}>{b.l}</button>)}
          </div>
          <p className="ed-hint">캔버스를 클릭하거나 드래그해서 말풍선을 놓으세요.</p>
        </div>
      );
    }
    if (tool === 'decor') {
      return (
        <div className="ed-group">
          <h4>장식·배경 요소</h4>
          <div className="ed-grid2">
            {DECOR_SHAPES.map((s) => <button key={s.v} type="button" className={`ed-btn ${decorShape === s.v ? 'on' : ''}`} onClick={() => setDecorShape(s.v)}>{s.l}</button>)}
          </div>
          <p className="ed-hint">스크린톤·그라데이션은 드래그해서 넓은 배경으로 깔 수 있어요.</p>
        </div>
      );
    }
    if (tool === 'frame') {
      return (
        <div className="ed-group">
          <h4>컷 나누기</h4>
          <div className="ed-grid2">
            {PANEL_LAYOUTS.map((p) => <button key={p.v} type="button" className="ed-btn" onClick={() => insertLayout(p.v)}>{p.l}</button>)}
          </div>
          <p className="ed-hint">레이아웃을 누르면 현재 페이지에 컷 프레임이 들어가요. 드래그하면 원하는 크기의 컷 하나를 그릴 수 있어요.</p>
        </div>
      );
    }
    const hints = { select: '아이템을 눌러 선택하고 드래그로 옮기세요. 모서리 손잡이로 크기를, 노란 점으로 말풍선 꼬리를 조절해요.', hand: '드래그해서 화면을 움직여요.', text: '캔버스를 클릭해 텍스트 상자를 넣으세요.', speed: '드래그한 영역에 효과선이 들어가요.', focus: '드래그한 영역 가운데로 모이는 집중선이 들어가요.' };
    return <div className="ed-group"><p className="ed-hint">{hints[tool]}</p></div>;
  };

  const itemProps = () => {
    if (!it) return null;
    const typeLabel = { bubble: '말풍선', text: '텍스트', frame: '컷 프레임', speed: '효과선', focus: '집중선', decor: '장식', image: '이미지' }[it.type];
    const hasText = it.type === 'bubble' || it.type === 'text';
    return (
      <div className="ed-group">
        <h4>{typeLabel} 속성</h4>
        {hasText && (
          <label className="ed-text"><span>내용</span>
            <textarea rows={3} value={it.text} onChange={(e) => updateItem({ text: e.target.value }, 'debounce')} />
          </label>
        )}
        {it.type === 'bubble' && (
          <>
            <label className="ed-select"><span>모양</span>
              <select value={it.style} onChange={(e) => updateItem({ style: e.target.value })}>{BUBBLE_STYLES.map((b) => <option key={b.v} value={b.v}>{b.l}</option>)}</select>
            </label>
            <label className="ed-check"><input type="checkbox" checked={!!it.tail} onChange={(e) => updateItem({ tail: e.target.checked })} /> 꼬리 표시</label>
            {it.tail && (
              <div className="ed-tail">
                <span>꼬리 방향</span>
                <div className="ed-grid3">
                  <button type="button" className="ed-btn" onClick={() => setTailDir('tl')}>↖</button>
                  <button type="button" className="ed-btn" onClick={() => setTailDir('tr')}>↗</button>
                  <button type="button" className="ed-btn" onClick={() => setTailDir('l')}>←</button>
                  <button type="button" className="ed-btn" onClick={() => setTailDir('r')}>→</button>
                  <button type="button" className="ed-btn" onClick={() => setTailDir('bl')}>↙</button>
                  <button type="button" className="ed-btn" onClick={() => setTailDir('br')}>↘</button>
                </div>
              </div>
            )}
          </>
        )}
        {hasText && (
          <>
            <label className="ed-select"><span>글꼴</span>
              <select value={it.font} onChange={async (e) => { const f = e.target.value; await document.fonts?.load(`800 ${it.fontSize}px ${f}`, '가').catch(() => {}); updateItem({ font: f }); }}>
                {FONTS.map((f) => <option key={f.v} value={f.v}>{f.l}</option>)}
              </select>
            </label>
            <div className="ed-row">
              {num('글자 크기', 'fontSize', { min: 8, max: 300 })}
              <label className="ed-check"><input type="checkbox" checked={!!it.bold} onChange={(e) => updateItem({ bold: e.target.checked })} /> 굵게</label>
            </div>
            {colorField('글자 색', 'color')}
          </>
        )}
        {it.type === 'text' && (
          <>
            <div className="ed-seg">
              {['left', 'center', 'right'].map((a) => <button type="button" key={a} className={it.align === a ? 'on' : ''} onClick={() => updateItem({ align: a })}>{{ left: '왼쪽', center: '가운데', right: '오른쪽' }[a]}</button>)}
            </div>
            {colorField('외곽선(효과음용)', 'outline', true)}
            {it.outline && num('외곽선 두께', 'outlineWidth', { min: 1, max: 40 })}
          </>
        )}
        {(it.type === 'bubble' || it.type === 'frame' || it.type === 'decor') && (
          <>
            {colorField('채우기', 'fill', it.type !== 'bubble')}
            {it.type === 'decor' && it.shape === 'gradient' ? colorField('끝 색', 'color2', true) : colorField('선 색', 'stroke')}
            {num(it.type === 'decor' && it.shape === 'tone' ? '점 간격' : '선 두께', 'strokeWidth', { min: 0, max: 60, step: 0.5 })}
          </>
        )}
        {it.type === 'decor' && (
          <label className="ed-select"><span>모양</span>
            <select value={it.shape} onChange={(e) => updateItem({ shape: e.target.value })}>{DECOR_SHAPES.map((s) => <option key={s.v} value={s.v}>{s.l}</option>)}</select>
          </label>
        )}
        {it.type === 'frame' && num('모서리 둥글기', 'radius', { min: 0, max: 200 })}
        {(it.type === 'speed' || it.type === 'focus') && (
          <>
            {colorField('선 색', 'color')}
            <label className="ed-range"><span>밀도 {it.density}</span><input type="range" min="5" max="250" value={it.density} onChange={(e) => updateItem({ density: Number(e.target.value) }, 'debounce')} /></label>
            {it.type === 'speed' && <label className="ed-range"><span>각도 {it.angle}°</span><input type="range" min="-90" max="90" value={it.angle} onChange={(e) => updateItem({ angle: Number(e.target.value) }, 'debounce')} /></label>}
            {it.type === 'speed' && <label className="ed-range"><span>굵기 {it.lineWidth}</span><input type="range" min="1" max="12" value={it.lineWidth} onChange={(e) => updateItem({ lineWidth: Number(e.target.value) }, 'debounce')} /></label>}
            {it.type === 'focus' && <label className="ed-range"><span>가운데 빈 공간 {Math.round(it.inner * 100)}%</span><input type="range" min="5" max="95" value={Math.round(it.inner * 100)} onChange={(e) => updateItem({ inner: Number(e.target.value) / 100 }, 'debounce')} /></label>}
            <button type="button" className="ed-btn" onClick={() => updateItem({ seed: Math.floor(Math.random() * 1e9) })}>선 배치 다시 섞기</button>
          </>
        )}
        <label className="ed-range"><span>불투명도 {Math.round((it.opacity ?? 1) * 100)}%</span>
          <input type="range" min="5" max="100" value={Math.round((it.opacity ?? 1) * 100)} onChange={(e) => updateItem({ opacity: Number(e.target.value) / 100 }, 'debounce')} />
        </label>
        <div className="ed-row4">
          {num('X', 'x')}{num('Y', 'y')}{num('너비', 'w', { min: 8 })}{num('높이', 'h', { min: 8 })}
        </div>
        <div className="ed-seg">
          <button type="button" onClick={() => reorder('top')} title="맨 앞으로">맨앞</button>
          <button type="button" onClick={() => reorder('up')} title="앞으로">앞으로</button>
          <button type="button" onClick={() => reorder('down')} title="뒤로">뒤로</button>
          <button type="button" onClick={() => reorder('bottom')} title="맨 뒤로">맨뒤</button>
        </div>
        <div className="ed-row">
          <button type="button" className="ed-btn" onClick={duplicateSelected}>복제 (Ctrl+D)</button>
          <button type="button" className="ed-btn danger" onClick={deleteSelected}>삭제 (Del)</button>
        </div>
      </div>
    );
  };

  const layersPanel = () => (
    <div className="ed-group">
      <div className="ed-layers-head">
        <h4>레이어 {d.layers.length}/{MAX_LAYERS}</h4>
        <button type="button" className="ed-mini" onClick={addLayer}>+ 새 레이어</button>
      </div>
      <ul className="ed-layers">
        {[...d.layers].reverse().map((l) => (
          <li key={l.id} className={l.id === activeLayerId ? 'on' : ''}>
            <button type="button" className="ed-eye" aria-label={l.visible ? '레이어 숨기기' : '레이어 보이기'} onClick={() => patchLayer(l.id, { visible: !l.visible })}>{l.visible ? '👁' : '—'}</button>
            <button type="button" className="ed-layer-name" onClick={() => { setActiveLayerId(l.id); activeRef.current = l.id; bump(); }}
              onDoubleClick={() => { const n = window.prompt('레이어 이름', l.name); if (n && n.trim()) patchLayer(l.id, { name: n.trim().slice(0, 30) }); }}>
              {l.name}<small>{l.items.length ? ` · 아이템 ${l.items.length}` : ''}</small>
            </button>
            <button type="button" className="ed-mini" onClick={() => moveLayer(l.id, 'up')} aria-label="위로">▲</button>
            <button type="button" className="ed-mini" onClick={() => moveLayer(l.id, 'down')} aria-label="아래로">▼</button>
          </li>
        ))}
      </ul>
      {(() => {
        const l = d.layers.find((x) => x.id === activeLayerId);
        if (!l) return null;
        return (
          <div className="ed-layer-opts">
            <label className="ed-range"><span>‘{l.name}’ 불투명도 {Math.round(l.opacity * 100)}%</span>
              <input type="range" min="0" max="100" value={Math.round(l.opacity * 100)} onChange={(e) => patchLayer(l.id, { opacity: Number(e.target.value) / 100 }, 'debounce')} />
            </label>
            <div className="ed-row">
              <button type="button" className="ed-btn" onClick={() => { const n = window.prompt('레이어 이름', l.name); if (n && n.trim()) patchLayer(l.id, { name: n.trim().slice(0, 30) }); }}>이름 변경</button>
              <button type="button" className="ed-btn" onClick={() => mergeDown(l.id)} disabled={d.layers[0].id === l.id}>아래로 합치기</button>
            </div>
            <div className="ed-row">
              <button type="button" className="ed-btn" onClick={() => clearLayerPixels(l.id)}>그림 지우기</button>
              <button type="button" className="ed-btn danger" onClick={() => deleteLayer(l.id)}>레이어 삭제</button>
            </div>
          </div>
        );
      })()}
    </div>
  );

  const canvasPanel = () => (
    <div className="ed-group">
      <h4>캔버스 크기</h4>
      <div className="ed-row">
        <label className="ed-num"><span>가로</span><input type="number" value={sizeForm.w} onChange={(e) => setSizeForm({ ...sizeForm, w: e.target.value })} /></label>
        <label className="ed-num"><span>세로</span><input type="number" value={sizeForm.h} onChange={(e) => setSizeForm({ ...sizeForm, h: e.target.value })} /></label>
      </div>
      <button type="button" className="ed-btn primary" onClick={() => resizeCanvas(sizeForm.w, sizeForm.h)}>크기 적용</button>
      <div className="ed-presets">
        {PAGE_PRESETS.map((p) => <button key={p.l} type="button" className="ed-btn" onClick={() => resizeCanvas(p.w, p.h)}>{p.l}</button>)}
      </div>
      <p className="ed-hint">크기를 바꾸면 왼쪽 위를 기준으로 늘어나거나 잘려요. 실행 취소로 되돌릴 수 있어요.</p>
      <h4>배경</h4>
      <div className="ed-swatches">
        {['#ffffff', '#f4f1e8', '#111111', '#dfe6ff', '#ffe9f1'].map((c) => <button key={c} type="button" className={d.background === c ? 'on' : ''} style={{ background: c }} onClick={() => { d.background = c; pushHistory(); scheduleRender(); }} aria-label={`배경 ${c}`} />)}
        <input type="color" value={d.background || '#ffffff'} onChange={(e) => { d.background = e.target.value; scheduleRender(); clearTimeout(debounceRef.current); debounceRef.current = setTimeout(pushHistory, 500); }} aria-label="배경색 선택" />
        <button type="button" className={`ed-mini ${!d.background ? 'on' : ''}`} onClick={() => { d.background = ''; pushHistory(); scheduleRender(); }}>투명</button>
      </div>
    </div>
  );

  return (
    <div className="editor">
      <div className="ed-tools" role="toolbar" aria-label="도구">
        {TOOLS.map((t) => (
          <button key={t.v} type="button" className={tool === t.v ? 'on' : ''} onClick={() => { setTool(t.v); if (t.v !== 'select') setSelectedId(null); setPanel('props'); }} title={`${t.l} (${t.key})`} aria-label={t.l} aria-pressed={tool === t.v}>
            <Ico d={t.icon} />
            <span>{t.l}</span>
          </button>
        ))}
        <button type="button" onClick={() => fileRef.current.click()} title="이미지 불러오기" aria-label="이미지 불러오기">
          <Ico d="M4 5h16v14H4zM4 16l5-5 4 4 3-3 4 4M15.5 9.5h.01" />
          <span>이미지</span>
        </button>
        <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden onChange={importImage} />
      </div>

      <div className="ed-center">
        <div className="ed-topline">
          <button type="button" className="ed-mini" onClick={undo} disabled={h.index <= 0} title="실행 취소 (Ctrl+Z)">↶ 실행 취소</button>
          <button type="button" className="ed-mini" onClick={redo} disabled={h.index >= h.list.length - 1} title="다시 실행 (Ctrl+Shift+Z)">↷ 다시 실행</button>
          <span className="ed-spacer" />
          <button type="button" className="ed-mini" onClick={() => setZoom((z) => Math.max(0.1, +(z / 1.25).toFixed(2)))} aria-label="축소">−</button>
          <button type="button" className="ed-mini ed-zoom" onClick={fitZoom} title="화면에 맞추기">{Math.round(zoom * 100)}%</button>
          <button type="button" className="ed-mini" onClick={() => setZoom((z) => Math.min(4, +(z * 1.25).toFixed(2)))} aria-label="확대">+</button>
          <button type="button" className="ed-mini" onClick={() => setZoom(1)}>100%</button>
          {d && <span className="ed-size">{d.width}×{d.height}</span>}
          <button type="button" className="ed-mini ed-panel-toggle" onClick={() => setPanelOpen((v) => !v)}>{panelOpen ? '패널 닫기' : '속성·레이어'}</button>
        </div>
        <div className="ed-viewport" ref={scrollRef}>
          {!ready && <div className="ed-loading">편집기를 준비하는 중…</div>}
          {d && (
            <div className="ed-stage" style={{ width: d.width * zoom + 48, height: d.height * zoom + 48 }}>
              <canvas
                ref={viewRef}
                width={d.width}
                height={d.height}
                className={`ed-canvas tool-${tool}`}
                style={{ width: d.width * zoom, height: d.height * zoom }}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
                onContextMenu={(e) => e.preventDefault()}
              />
            </div>
          )}
        </div>
      </div>

      <aside className={`ed-panel ${panelOpen ? 'open' : ''}`}>
        <div className="ed-tabs" role="tablist">
          <button type="button" role="tab" aria-selected={panel === 'props'} className={panel === 'props' ? 'on' : ''} onClick={() => setPanel('props')}>속성</button>
          <button type="button" role="tab" aria-selected={panel === 'layers'} className={panel === 'layers' ? 'on' : ''} onClick={() => setPanel('layers')}>레이어</button>
          <button type="button" role="tab" aria-selected={panel === 'canvas'} className={panel === 'canvas' ? 'on' : ''} onClick={() => setPanel('canvas')}>캔버스</button>
          <button type="button" className="ed-panel-close" onClick={() => setPanelOpen(false)} aria-label="패널 닫기">✕</button>
        </div>
        <div className="ed-panel-body">
          {d && panel === 'props' && (it ? itemProps() : toolOptions())}
          {d && panel === 'layers' && layersPanel()}
          {d && panel === 'canvas' && canvasPanel()}
        </div>
      </aside>
    </div>
  );
});

export default Editor;
