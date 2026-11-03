import { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react';
import {
  applyResize,
  BUBBLE_STYLES,
  bubblePreset,
  createItem,
  DECOR_SHAPES,
  decorPreset,
  FONTS,
  handlePoints,
  hitItem,
  loadImage,
  PAGE_PRESETS,
  PANEL_LAYOUTS,
  panelLayout,
  uid,
} from './core.js';
import {
  BLEND_MODES,
  canvasToBlobSafe,
  drawDocRegion,
  isCanvasEmpty,
  LAYER_DEFAULTS,
  LAYER_PRESETS,
  makeCanvas,
  MAX_DOC_HEIGHT,
  MAX_DOC_WIDTH,
  parseKey,
  renderRegion,
  TILE,
  tileKey,
  tilesInRect,
} from './render.js';
import { saveDoc } from './docApi.js';
import { api } from '../lib/api.js';
import { useToast } from '../context/ToastContext.jsx';

const SWATCHES = ['#111111', '#555a6e', '#ffffff', '#2F4BFF', '#FF4F8B', '#FFD23F', '#21B573', '#FF7A1A', '#8E5CFF', '#9C6B3C'];
const MAX_HISTORY = 50;
const MAX_LAYERS = 30;
const MAX_ITEMS = 3000;
const PAD = 40;

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
const clone = (o) => JSON.parse(JSON.stringify(o));
const groupBy = (arr) => arr.reduce((m, x) => { (m[x.g] = m[x.g] || []).push(x); return m; }, {});

function emptyLiveDoc(w = 800, h = 1280) {
  return { width: w, height: h, background: '#ffffff', layers: [{ ...LAYER_DEFAULTS, id: uid('l'), name: '레이어 1', tiles: new Map(), items: [] }] };
}

/**
 * 웹툰/일러스트 공용 캔버스 편집기 (타일 기반, 화면에 보이는 부분만 그림)
 * props.data: buildDoc() 로 만든 문서 (없으면 빈 캔버스)
 * ref API: isDirty(), save(), getDoc(), renderBlob(), thumbnail()
 */
const Editor = forwardRef(function Editor({ data, docId, defaultSize, onDirtyChange, onReady }, ref) {
  const toast = useToast();
  const canvasRef = useRef(null);
  const scrollRef = useRef(null);
  const docRef = useRef(null);
  const bufsRef = useRef(null);
  const histRef = useRef({ list: [], index: -1 });
  const savedRef = useRef({ tiles: new Map(), metaJson: '' });
  const strokeRef = useRef(null);
  const dragRef = useRef(null);
  const pointersRef = useRef(new Map());
  const pinchRef = useRef(null);
  const rafRef = useRef(0);
  const dirtyRef = useRef(false);
  const debounceRef = useRef(0);
  const spaceRef = useRef(false);
  const fileRef = useRef(null);
  const anchorRef = useRef(null);
  const savingRef = useRef(null);

  const [, setVer] = useState(0);
  const bump = () => setVer((v) => v + 1);
  const [ready, setReady] = useState(false);
  const [tool, setTool] = useState('brush');
  const [color, setColor] = useState('#111111');
  const [size, setSize] = useState(6);
  const [eraserSize, setEraserSize] = useState(24);
  const [brushOpacity, setBrushOpacity] = useState(1);
  const [pressure, setPressure] = useState(true);
  const [zoom, setZoomState] = useState(0.5);
  const [activeLayerId, setActiveLayerId] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [bubbleStyle, setBubbleStyle] = useState('round');
  const [decorShape, setDecorShape] = useState('star');
  const [layerPreset, setLayerPreset] = useState('normal');
  const [panel, setPanel] = useState('props');
  const [panelOpen, setPanelOpen] = useState(false);
  const [sizeForm, setSizeForm] = useState({ w: 800, h: 1280 });

  const selectedIdRef = useRef(null);
  const zoomRef = useRef(zoom);
  const toolRef = useRef(tool);
  const activeRef = useRef(null);

  const setDirty = useCallback((v) => {
    if (dirtyRef.current !== v) { dirtyRef.current = v; onDirtyChange?.(v); }
  }, [onDirtyChange]);

  /* ---------------- 좌표·배치 ---------------- */
  function layout(z = zoomRef.current) {
    const s = scrollRef.current;
    const d = docRef.current;
    const cw = s?.clientWidth || 800;
    const ch = s?.clientHeight || 600;
    const offX = Math.max(PAD, (cw - d.width * z) / 2);
    return { cw, ch, offX, offY: PAD, sl: s?.scrollLeft || 0, st: s?.scrollTop || 0, z };
  }
  function toDoc(e) {
    const r = canvasRef.current.getBoundingClientRect();
    const L = layout();
    return { x: (e.clientX - r.left + L.sl - L.offX) / L.z, y: (e.clientY - r.top + L.st - L.offY) / L.z };
  }
  /** 확대율 변경 — (sx,sy) 화면 지점 아래의 그림이 제자리에 있도록 */
  function setZoom(next, sx, sy) {
    const z0 = zoomRef.current;
    const z = Math.min(8, Math.max(0.05, typeof next === 'function' ? next(z0) : next));
    if (!docRef.current || z === z0) return;
    const L = layout(z0);
    const ax = sx ?? L.cw / 2;
    const ay = sy ?? L.ch / 2;
    anchorRef.current = { docX: (ax + L.sl - L.offX) / z0, docY: (ay + L.st - L.offY) / z0, ax, ay };
    zoomRef.current = z;
    setZoomState(z);
  }
  useLayoutEffect(() => {
    const a = anchorRef.current;
    if (!a || !docRef.current) return;
    anchorRef.current = null;
    const L = layout(zoom);
    const s = scrollRef.current;
    s.scrollLeft = L.offX + a.docX * zoom - a.ax;
    s.scrollTop = L.offY + a.docY * zoom - a.ay;
    scheduleRender();
  }, [zoom]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---------------- 렌더링 (보이는 영역만) ---------------- */
  const renderNow = useCallback(() => {
    rafRef.current = 0;
    const c = canvasRef.current;
    const d = docRef.current;
    const s = scrollRef.current;
    if (!c || !d || !s) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const L = layout();
    const pw = Math.max(1, Math.round(L.cw * dpr));
    const ph = Math.max(1, Math.round(L.ch * dpr));
    if (c.width !== pw || c.height !== ph) { c.width = pw; c.height = ph; c.style.width = `${L.cw}px`; c.style.height = `${L.ch}px`; }
    const ctx = c.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#e3e5ee';
    ctx.fillRect(0, 0, pw, ph);
    const ox = L.offX - L.sl;
    const oy = L.offY - L.st;
    // 종이 그림자
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = 'rgba(23,24,43,.16)';
    ctx.fillRect(ox + 2, oy + 4, d.width * L.z, d.height * L.z);
    ctx.setTransform(dpr * L.z, 0, 0, dpr * L.z, dpr * ox, dpr * oy);
    const rect = { x: (L.sl - L.offX) / L.z, y: (L.st - L.offY) / L.z, w: L.cw / L.z, h: L.ch / L.z };
    drawDocRegion(ctx, d, rect, bufsRef.current, { stroke: strokeRef.current, onImageLoad: scheduleRender, transparentChecker: true });

    // 선택 표시
    const sel = findItem(selectedIdRef.current);
    const z = L.z;
    if (sel) {
      const it = sel.item;
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
    const drag = dragRef.current;
    if (drag?.kind === 'place') {
      ctx.save();
      ctx.strokeStyle = '#2F4BFF';
      ctx.lineWidth = 2 / z;
      ctx.setLineDash([8 / z, 6 / z]);
      ctx.strokeRect(Math.min(drag.start.x, drag.cur.x), Math.min(drag.start.y, drag.cur.y), Math.abs(drag.cur.x - drag.start.x), Math.abs(drag.cur.y - drag.start.y));
      ctx.restore();
    }
    // 장 경계 안내선 (합친 장의 원래 경계는 따로 저장하지 않으므로 표시하지 않음)
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function scheduleRender() {
    if (!rafRef.current) rafRef.current = requestAnimationFrame(renderNow);
  }

  useEffect(() => { selectedIdRef.current = selectedId; scheduleRender(); }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps
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
  const itemCount = () => docRef.current.layers.reduce((s, l) => s + l.items.length, 0);

  /* ---------------- 히스토리 (타일 캔버스는 바꾸지 않고 새로 만들기 때문에 얕은 복사로 충분) ---------------- */
  function snapshot() {
    const d = docRef.current;
    return {
      width: d.width, height: d.height, background: d.background, active: activeRef.current,
      layers: d.layers.map((l) => ({ ...l, tiles: new Map(l.tiles), items: clone(l.items) })),
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
  function restore(s) {
    const d = docRef.current;
    d.width = s.width;
    d.height = s.height;
    d.background = s.background;
    d.layers = s.layers.map((l) => ({ ...l, tiles: new Map(l.tiles), items: clone(l.items) }));
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
    bufsRef.current = { a: makeCanvas(1, 1), b: makeCanvas(1, 1) };
    const d = data && data.layers ? data : emptyLiveDoc(defaultSize?.w, defaultSize?.h);
    d.layers.forEach((l) => Object.keys(LAYER_DEFAULTS).forEach((k) => { if (l[k] === undefined) l[k] = LAYER_DEFAULTS[k]; }));
    docRef.current = d;
    const top = d.layers[d.layers.length - 1].id;
    activeRef.current = top;
    setActiveLayerId(top);
    setSelectedId(null);
    setSizeForm({ w: d.width, h: d.height });
    histRef.current = { list: [], index: -1 };
    histRef.current.list.push(snapshot());
    histRef.current.index = 0;
    // 서버에 이미 있는 상태를 "저장됨"으로 기록 (예전 형식에서 변환된 문서는 전부 다시 저장해야 함)
    const saved = new Map();
    if (data && !data.legacy) for (const l of d.layers) for (const [k, c] of l.tiles) saved.set(`${l.id}|${k}`, c);
    savedRef.current = { tiles: saved, metaJson: data && !data.legacy ? metaKey(d) : '' };
    dirtyRef.current = !!(data && data.legacy);
    onDirtyChange?.(dirtyRef.current);
    const vw = scrollRef.current?.clientWidth || 800;
    const z = Math.min(1, Math.max(0.1, Math.floor(((vw - PAD * 2) / d.width) * 20) / 20));
    zoomRef.current = z;
    setZoomState(z);
    if (scrollRef.current) { scrollRef.current.scrollTop = 0; scrollRef.current.scrollLeft = 0; }
    setReady(true);
    bump();
    scheduleRender();
    onReady?.();
  }, [data]); // eslint-disable-line react-hooks/exhaustive-deps

  // 화면 크기 변화·스크롤 시 다시 그리기
  useEffect(() => {
    const s = scrollRef.current;
    if (!s) return undefined;
    const onScroll = () => scheduleRender();
    s.addEventListener('scroll', onScroll, { passive: true });
    const ro = new ResizeObserver(() => scheduleRender());
    ro.observe(s);
    return () => { s.removeEventListener('scroll', onScroll); ro.disconnect(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function metaKey(d) {
    return JSON.stringify({ w: d.width, h: d.height, b: d.background, l: d.layers.map((l) => [l.id, l.name, l.visible, l.opacity, l.blend, l.clip, l.locked, l.alphaLock, l.items, [...l.tiles.keys()]]) });
  }

  /* ---------------- 외부 API ---------------- */
  useImperativeHandle(ref, () => ({
    isDirty: () => dirtyRef.current,
    getDoc: () => docRef.current,
    /** 바뀐 타일만 서버에 저장 */
    async save(onProgress) {
      if (savingRef.current) return savingRef.current;
      const run = (async () => {
        const d = docRef.current;
        const prev = savedRef.current.tiles;
        const now = new Map();
        const put = [];
        for (const l of d.layers) {
          for (const [k, c] of l.tiles) {
            const id = `${l.id}|${k}`;
            now.set(id, c);
            if (prev.get(id) !== c) put.push({ layer: l.id, key: k, canvas: c });
          }
        }
        const del = [];
        for (const id of prev.keys()) if (!now.has(id)) { const [layer, key] = id.split('|'); del.push({ layer, key }); }
        const mk = metaKey(d);
        if (!put.length && !del.length && mk === savedRef.current.metaJson && savedRef.current.metaJson) { setDirty(false); return { saved: false }; }
        const histIndexAtSave = histRef.current.list[histRef.current.index];
        await saveDoc(docId, d, { put, del }, onProgress);
        savedRef.current = { tiles: now, metaJson: mk };
        // 저장하는 동안 새로 그린 게 없으면 "저장됨"
        if (histRef.current.list[histRef.current.index] === histIndexAtSave) setDirty(false);
        return { saved: true, tiles: put.length };
      })();
      savingRef.current = run;
      try { return await run; } finally { savingRef.current = null; }
    },
    async renderBlob() {
      const d = docRef.current;
      if (d.width * d.height > 36000000) throw new Error('그림이 너무 커서 한 장의 이미지로 만들 수 없어요. 캔버스 크기를 줄여 주세요.');
      const c = renderRegion(d, 0, 0, d.width, d.height);
      const blob = await canvasToBlobSafe(c);
      return { blob, width: d.width, height: d.height };
    },
    thumbnail(maxW = 160) {
      const d = docRef.current;
      if (!d) return '';
      const h = Math.min(d.height, Math.round(d.width * 1.6));
      return renderRegion(d, 0, 0, d.width, h, maxW / d.width).toDataURL('image/jpeg', 0.7);
    },
  }), [docId, setDirty]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---------------- 붓질 (타일 단위) ---------------- */
  function strokeTile(st, tx, ty) {
    const k = tileKey(tx, ty);
    let c = st.tiles.get(k);
    if (!c) { c = makeCanvas(TILE, TILE); st.tiles.set(k, c); }
    const ctx = c.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, -tx * TILE, -ty * TILE);
    return ctx;
  }
  function brushWidth(ev, erase) {
    return (erase ? eraserSize : size) * (pressure && ev.pointerType === 'pen' ? Math.max(0.15, ev.pressure || 0.5) * 1.6 : 1);
  }
  function strokeDot(st, p, w) {
    const d = docRef.current;
    for (const [tx, ty] of tilesInRect(p.x - w, p.y - w, w * 2, w * 2, d.width, d.height)) {
      const ctx = strokeTile(st, tx, ty);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, w / 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  function strokeSegment(st, from, ctrl, to, w) {
    const d = docRef.current;
    const x0 = Math.min(from.x, ctrl.x, to.x) - w;
    const y0 = Math.min(from.y, ctrl.y, to.y) - w;
    const x1 = Math.max(from.x, ctrl.x, to.x) + w;
    const y1 = Math.max(from.y, ctrl.y, to.y) + w;
    for (const [tx, ty] of tilesInRect(x0, y0, x1 - x0, y1 - y0, d.width, d.height)) {
      const ctx = strokeTile(st, tx, ty);
      ctx.strokeStyle = color;
      ctx.lineWidth = w;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.quadraticCurveTo(ctrl.x, ctrl.y, to.x, to.y);
      ctx.stroke();
    }
  }
  function commitStroke() {
    const st = strokeRef.current;
    strokeRef.current = null;
    if (!st) return;
    const layer = docRef.current.layers.find((l) => l.id === st.layerId);
    if (!layer) return;
    for (const [k, sc] of st.tiles) {
      const old = layer.tiles.get(k);
      if ((st.erase || layer.alphaLock) && !old) continue;
      // 기존 타일은 건드리지 않고 새 타일을 만든다 (실행 취소 기록이 기존 타일을 그대로 참조)
      const nc = makeCanvas(TILE, TILE);
      const ctx = nc.getContext('2d');
      if (old) ctx.drawImage(old, 0, 0);
      ctx.globalCompositeOperation = st.erase ? 'destination-out' : layer.alphaLock ? 'source-atop' : 'source-over';
      ctx.globalAlpha = st.erase ? 1 : st.opacity;
      ctx.drawImage(sc, 0, 0);
      if (st.erase && isCanvasEmpty(nc)) layer.tiles.delete(k);
      else layer.tiles.set(k, nc);
    }
    pushHistory();
    scheduleRender();
  }

  /* ---------------- 포인터 ---------------- */
  function startPinch() {
    const pts = [...pointersRef.current.values()];
    if (pts.length < 2) return;
    strokeRef.current = null; // 두 손가락이 닿으면 진행 중인 붓질은 취소
    dragRef.current = null;
    const [a, b] = pts;
    const r = canvasRef.current.getBoundingClientRect();
    pinchRef.current = {
      dist: Math.hypot(a.x - b.x, a.y - b.y) || 1,
      mx: (a.x + b.x) / 2 - r.left,
      my: (a.y + b.y) / 2 - r.top,
      z: zoomRef.current,
      sl: scrollRef.current.scrollLeft,
      st: scrollRef.current.scrollTop,
    };
    scheduleRender();
  }

  function onPointerDown(e) {
    if (!ready || e.button === 2) return;
    if (panelOpen) setPanelOpen(false);
    canvasRef.current.setPointerCapture(e.pointerId);
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointersRef.current.size >= 2 && e.pointerType === 'touch') { startPinch(); return; }
    const d = docRef.current;
    const p = toDoc(e);
    const t = spaceRef.current || e.button === 1 ? 'hand' : toolRef.current;

    if (t === 'hand') {
      const s = scrollRef.current;
      dragRef.current = { kind: 'pan', sx: e.clientX, sy: e.clientY, sl: s.scrollLeft, st: s.scrollTop };
      return;
    }
    if (t === 'brush' || t === 'eraser') {
      const layer = activeLayer();
      if (!layer.visible) { toast.info('숨겨진 레이어에는 그릴 수 없어요. 눈 아이콘으로 레이어를 표시해 주세요.'); return; }
      if (layer.locked) { toast.info('잠긴 레이어예요. 레이어 패널에서 잠금을 풀어 주세요.'); return; }
      const erase = t === 'eraser';
      const st = { tiles: new Map(), layerId: layer.id, erase, opacity: erase ? 1 : brushOpacity, last: p, lastMid: p };
      strokeRef.current = st;
      strokeDot(st, p, brushWidth(e, erase));
      scheduleRender();
      return;
    }
    if (t === 'select') {
      const z = zoomRef.current;
      const tol = 9 / z;
      const sel = findItem(selectedIdRef.current);
      if (sel && !sel.layer.locked) {
        for (const [name, hx, hy] of handlePoints(sel.item)) {
          if (Math.abs(p.x - hx) <= tol && Math.abs(p.y - hy) <= tol) {
            dragRef.current = { kind: name === 'tail' ? 'tail' : 'resize', handle: name, start: p, orig: clone(sel.item), id: sel.item.id };
            return;
          }
        }
      }
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
            if (!l.locked) dragRef.current = { kind: 'move', start: p, orig: clone(it), id: it.id, moved: false };
            setPanel('props');
            scheduleRender();
            return;
          }
        }
      }
      setSelectedId(null);
      return;
    }
    if (activeLayer().locked) { toast.info('잠긴 레이어에는 아이템을 넣을 수 없어요.'); return; }
    dragRef.current = { kind: 'place', start: p, cur: p, tool: t };
  }

  function onPointerMove(e) {
    if (pointersRef.current.has(e.pointerId)) pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pinch = pinchRef.current;
    if (pinch && pointersRef.current.size >= 2) {
      const [a, b] = [...pointersRef.current.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      const r = canvasRef.current.getBoundingClientRect();
      const mx = (a.x + b.x) / 2 - r.left;
      const my = (a.y + b.y) / 2 - r.top;
      const z = Math.min(8, Math.max(0.05, pinch.z * (dist / pinch.dist)));
      const L0 = { ...layout(pinch.z), sl: pinch.sl, st: pinch.st };
      const docX = (pinch.mx + L0.sl - L0.offX) / pinch.z;
      const docY = (pinch.my + L0.st - L0.offY) / pinch.z;
      anchorRef.current = { docX, docY, ax: mx, ay: my };
      zoomRef.current = z;
      setZoomState(z);
      return;
    }
    const drag = dragRef.current;
    const st = strokeRef.current;
    if (!drag && !st) return;
    const p = toDoc(e);
    if (st) {
      const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
      for (const ev of evs.length ? evs : [e]) {
        const q = toDoc(ev);
        const mid = { x: (st.last.x + q.x) / 2, y: (st.last.y + q.y) / 2 };
        strokeSegment(st, st.lastMid, st.last, mid, brushWidth(ev, st.erase));
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
      Object.assign(found.item, applyResize(drag.orig, drag.handle, p.x - drag.start.x, p.y - drag.start.y, keep && !e.altKey));
      drag.moved = true;
    } else if (drag.kind === 'tail' && found) {
      Object.assign(found.item, { tailX: p.x, tailY: p.y });
      drag.moved = true;
    } else if (drag.kind === 'place') {
      drag.cur = p;
    }
    scheduleRender();
  }

  function onPointerUp(e) {
    pointersRef.current.delete(e.pointerId);
    if (pinchRef.current) {
      if (pointersRef.current.size < 2) pinchRef.current = null;
      return;
    }
    if (strokeRef.current) { commitStroke(); return; }
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag) return;
    if (drag.kind === 'place') { placeItem(drag.tool, drag.start, drag.cur); return; }
    if (drag.moved) pushHistory();
    scheduleRender();
  }

  function onWheel(e) {
    const s = scrollRef.current;
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const r = canvasRef.current.getBoundingClientRect();
      setZoom((z) => z * (e.deltaY < 0 ? 1.1 : 1 / 1.1), e.clientX - r.left, e.clientY - r.top);
      return;
    }
    s.scrollLeft += e.shiftKey ? e.deltaY : e.deltaX;
    s.scrollTop += e.shiftKey ? 0 : e.deltaY;
  }
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return undefined;
    const h = (e) => onWheel(e);
    c.addEventListener('wheel', h, { passive: false });
    return () => c.removeEventListener('wheel', h);
  });

  /* ---------------- 아이템 ---------------- */
  function viewCenter() {
    const L = layout();
    return { x: (L.sl + L.cw / 2 - L.offX) / L.z, y: (L.st + L.ch / 2 - L.offY) / L.z };
  }
  function placeItem(t, a, b) {
    const d = docRef.current;
    let x = Math.min(a.x, b.x);
    let y = Math.min(a.y, b.y);
    let w = Math.abs(b.x - a.x);
    let h = Math.abs(b.y - a.y);
    const vw = Math.min(d.width, layout().cw / zoomRef.current);
    const defaults = {
      bubble: bubbleStyle === 'system' ? [d.width * 0.62, d.width * 0.3] : bubbleStyle === 'chat' ? [d.width * 0.46, d.width * 0.14] : [d.width * 0.42, d.width * 0.26],
      text: [d.width * 0.4, 70], frame: [d.width * 0.8, Math.min(d.height, d.width) * 0.4], speed: [d.width * 0.6, d.width * 0.4],
      focus: [d.width, d.width * 1.1], decor: decorShape === 'phone' ? [d.width * 0.5, d.width * 0.9] : ['flashbg', 'tone', 'gradient', 'gloom'].includes(decorShape) ? [d.width, d.width * 0.8] : [120, 120],
    };
    if (w < 12 || h < 12) {
      [w, h] = defaults[t] || [150, 100];
      w = Math.min(w, vw);
      x = a.x - w / 2;
      y = a.y - h / 2;
    }
    const base = Math.round(Math.max(18, d.width / 30));
    let extra = {};
    if (t === 'bubble') extra = { fontSize: base, ...bubblePreset(bubbleStyle, base) };
    else if (t === 'decor') extra = decorPreset(decorShape, color);
    else if (t === 'text') extra = { color, fontSize: Math.round(Math.max(20, d.width / 25)) };
    else if (t === 'speed' || t === 'focus') extra = { color };
    const it = createItem(t, x, y, w, h, extra);
    if (t === 'bubble') { it.tailX = x + w * 0.3; it.tailY = y + h + Math.max(30, h * 0.45); }
    addItems([it]);
  }
  function addItems(items) {
    const layer = activeLayer();
    if (layer.locked) { toast.info('잠긴 레이어에는 아이템을 넣을 수 없어요.'); return; }
    if (itemCount() + items.length > MAX_ITEMS) { toast.error(`아이템은 한 장에 최대 ${MAX_ITEMS}개까지 넣을 수 있어요.`); return; }
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
    if (!f || f.layer.locked) return;
    f.layer.items.splice(f.index, 1);
    setSelectedId(null);
    pushHistory();
    scheduleRender();
  }
  function duplicateSelected() {
    const f = findItem(selectedIdRef.current);
    if (!f || f.layer.locked) return;
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
  function applyBubbleStyle(style) {
    const f = findItem(selectedIdRef.current);
    if (!f) return;
    const pre = bubblePreset(style, f.item.fontSize);
    delete pre.fontSize;
    if (f.item.text && f.item.text !== '대사를 입력하세요') delete pre.text;
    updateItem(pre);
  }

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
      const s = Math.min(1, (d.width * 0.9) / img.naturalWidth, (Math.min(d.height, 3000) * 0.9) / img.naturalHeight);
      const w = img.naturalWidth * s;
      const h = img.naturalHeight * s;
      const c = viewCenter();
      const cy = Math.min(d.height - h, Math.max(0, c.y - h / 2));
      addItems([createItem('image', (d.width - w) / 2, cy, w, h, { src: r.url })]);
    } catch (err) { toast.error(err); }
  }

  /* ---------------- 레이어 ---------------- */
  function addLayer(presetKey = layerPreset) {
    const d = docRef.current;
    if (d.layers.length >= MAX_LAYERS) { toast.error(`레이어는 최대 ${MAX_LAYERS}개까지 만들 수 있어요.`); return; }
    const pre = LAYER_PRESETS.find((p) => p.v === presetKey) || LAYER_PRESETS[0];
    const idx = d.layers.findIndex((x) => x.id === activeRef.current);
    const sameName = d.layers.filter((l) => l.name.startsWith(pre.name)).length;
    const l = {
      ...LAYER_DEFAULTS, id: uid('l'), name: sameName ? `${pre.name} ${sameName + 1}` : pre.name,
      blend: pre.blend, clip: !!pre.clip && idx >= 0, opacity: pre.opacity ?? 1, tiles: new Map(), items: [],
    };
    d.layers.splice(idx + 1, 0, l);
    setActiveLayerId(l.id);
    activeRef.current = l.id;
    pushHistory();
    scheduleRender();
  }
  function duplicateLayer(id) {
    const d = docRef.current;
    if (d.layers.length >= MAX_LAYERS) { toast.error(`레이어는 최대 ${MAX_LAYERS}개까지 만들 수 있어요.`); return; }
    if (itemCount() + (d.layers.find((x) => x.id === id)?.items.length || 0) > MAX_ITEMS) { toast.error('아이템 수 제한을 넘어 복제할 수 없어요.'); return; }
    const idx = d.layers.findIndex((x) => x.id === id);
    const src = d.layers[idx];
    const items = clone(src.items).map((it) => ({ ...it, id: uid() }));
    const l = { ...src, id: uid('l'), name: `${src.name} 복사`, tiles: new Map(src.tiles), items };
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
    if (d.layers[0].clip) d.layers[0].clip = false;
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
    if (d.layers[0].clip) d.layers[0].clip = false;
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
    l.tiles = new Map();
    pushHistory();
    scheduleRender();
  }
  function mergeDown(id) {
    const d = docRef.current;
    const idx = d.layers.findIndex((l) => l.id === id);
    if (idx <= 0) return;
    const top = d.layers[idx];
    const below = d.layers[idx - 1];
    if (itemCount() > MAX_ITEMS) return;
    const BLEND = Object.fromEntries(BLEND_MODES.map((b) => [b.v, b.op]));
    const keys = new Set([...top.tiles.keys()]);
    const tiles = new Map(below.tiles);
    for (const k of keys) {
      const t = top.tiles.get(k);
      const b = below.tiles.get(k);
      if (top.clip && !b) continue;
      let src = t;
      if (top.clip) {
        src = makeCanvas(TILE, TILE);
        const sc = src.getContext('2d');
        sc.drawImage(t, 0, 0);
        sc.globalCompositeOperation = 'destination-in';
        sc.drawImage(b, 0, 0);
      }
      const nc = makeCanvas(TILE, TILE);
      const ctx = nc.getContext('2d');
      if (b) ctx.drawImage(b, 0, 0);
      ctx.globalAlpha = Math.min(1, top.opacity / (below.opacity || 1));
      ctx.globalCompositeOperation = BLEND[top.blend] || 'source-over';
      ctx.drawImage(src, 0, 0);
      tiles.set(k, nc);
    }
    below.tiles = tiles;
    below.items.push(...top.items);
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
    if (!(w >= 50 && w <= MAX_DOC_WIDTH && h >= 50 && h <= MAX_DOC_HEIGHT)) {
      toast.error(`가로 50~${MAX_DOC_WIDTH}px, 세로 50~${MAX_DOC_HEIGHT.toLocaleString()}px 사이로 입력해 주세요.`);
      return;
    }
    const d = docRef.current;
    if (w === d.width && h === d.height) return;
    // 바깥으로 벗어난 타일은 버리고, 경계에 걸친 타일은 잘라 낸다
    for (const l of d.layers) {
      const tiles = new Map();
      for (const [k, c] of l.tiles) {
        const { tx, ty } = parseKey(k);
        const x = tx * TILE;
        const y = ty * TILE;
        if (x >= w || y >= h) continue;
        if (x + TILE > w || y + TILE > h) {
          const nc = makeCanvas(TILE, TILE);
          nc.getContext('2d').drawImage(c, 0, 0, Math.min(TILE, w - x), Math.min(TILE, h - y), 0, 0, Math.min(TILE, w - x), Math.min(TILE, h - y));
          if (!isCanvasEmpty(nc)) tiles.set(k, nc);
        } else tiles.set(k, c);
      }
      l.tiles = tiles;
    }
    d.width = w;
    d.height = h;
    setSizeForm({ w, h });
    pushHistory();
    scheduleRender();
  }
  function insertLayout(kind) {
    const d = docRef.current;
    const c = viewCenter();
    const ph = Math.min(d.height, Math.round(d.width * 1.6));
    const top = Math.max(0, Math.min(d.height - ph, c.y - ph / 2));
    const frames = panelLayout(kind, d.width, ph, Math.round(d.width * 0.05), Math.round(d.width * 0.035), Math.max(3, Math.round(d.width / 140)));
    frames.forEach((f) => { f.y += top; });
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
      if (mod && (e.key === '=' || e.key === '+')) { e.preventDefault(); setZoom((z) => z * 1.25); return; }
      if (mod && e.key === '-') { e.preventDefault(); setZoom((z) => z / 1.25); return; }
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
  });

  /* ---------------- UI ---------------- */
  const d = docRef.current;
  const sel = findItem(selectedId);
  const it = sel?.item;
  const h = histRef.current;
  const L = d ? layout(zoom) : null;
  const fitZoom = () => {
    const vw = scrollRef.current?.clientWidth || 800;
    setZoom(Math.min(4, Math.max(0.05, +((vw - PAD * 2) / d.width).toFixed(2))));
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
  const groupedButtons = (list, current, onPick) => Object.entries(groupBy(list)).map(([g, xs]) => (
    <div key={g} className="ed-sub">
      <span className="ed-sub-title">{g}</span>
      <div className="ed-grid2">
        {xs.map((x) => <button key={x.v} type="button" className={`ed-btn ${current === x.v ? 'on' : ''}`} onClick={() => onPick(x.v)}>{x.l}</button>)}
      </div>
    </div>
  ));

  const toolOptions = () => {
    if (tool === 'brush' || tool === 'eraser') {
      const isE = tool === 'eraser';
      const al = activeLayer();
      return (
        <div className="ed-group">
          <h4>{isE ? '지우개' : '브러시'} <small className="ed-on-layer">· {al?.name}{al?.alphaLock ? ' (투명도 잠금)' : ''}</small></h4>
          {!isE && (
            <div className="ed-swatches">
              {SWATCHES.map((c) => <button key={c} type="button" className={color === c ? 'on' : ''} style={{ background: c }} onClick={() => setColor(c)} aria-label={`색상 ${c}`} />)}
              <input type="color" value={color} onChange={(e) => setColor(e.target.value)} aria-label="색상 직접 선택" />
            </div>
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
          <p className="ed-hint">[ / ] 키로 크기 조절 · 스페이스를 누른 채 드래그하면 화면 이동 · 휴대폰은 두 손가락으로 확대·이동</p>
        </div>
      );
    }
    if (tool === 'bubble') {
      return (
        <div className="ed-group">
          <h4>말풍선 종류</h4>
          {groupedButtons(BUBBLE_STYLES, bubbleStyle, setBubbleStyle)}
          <p className="ed-hint">캔버스를 클릭하거나 드래그해서 말풍선을 놓으세요. 놓은 뒤에도 속성에서 종류를 바꿀 수 있어요.</p>
        </div>
      );
    }
    if (tool === 'decor') {
      return (
        <div className="ed-group">
          <h4>장식·배경 요소</h4>
          {groupedButtons(DECOR_SHAPES, decorShape, setDecorShape)}
          <p className="ed-hint">배경 요소는 드래그해서 넓게 깔 수 있어요.</p>
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
          <p className="ed-hint">레이아웃을 누르면 지금 보고 있는 위치에 컷 프레임이 들어가요. 드래그하면 원하는 크기의 컷 하나를 그릴 수 있어요.</p>
        </div>
      );
    }
    const hints = { select: '아이템을 눌러 선택하고 드래그로 옮기세요. 모서리 손잡이로 크기를, 노란 점으로 말풍선 꼬리를 조절해요.', hand: '드래그해서 화면을 움직여요.', text: '캔버스를 클릭해 텍스트 상자를 넣으세요. 효과음은 외곽선·기울기·그림자를 켜 보세요.', speed: '드래그한 영역에 효과선이 들어가요.', focus: '드래그한 영역 가운데로 모이는 집중선이 들어가요.' };
    return <div className="ed-group"><p className="ed-hint">{hints[tool]}</p></div>;
  };

  const itemProps = () => {
    if (!it) return null;
    const typeLabel = { bubble: '말풍선', text: '텍스트', frame: '컷 프레임', speed: '효과선', focus: '집중선', decor: '장식', image: '이미지' }[it.type];
    const hasText = it.type === 'bubble' || it.type === 'text';
    const locked = sel.layer.locked;
    return (
      <div className="ed-group">
        <h4>{typeLabel} 속성 {locked && <small className="ed-on-layer">· 잠긴 레이어</small>}</h4>
        {hasText && (
          <label className="ed-text"><span>내용</span>
            <textarea rows={3} value={it.text} onChange={(e) => updateItem({ text: e.target.value }, 'debounce')} />
          </label>
        )}
        {it.type === 'bubble' && (
          <>
            <label className="ed-select"><span>말풍선 종류</span>
              <select value={it.style} onChange={(e) => applyBubbleStyle(e.target.value)}>
                {Object.entries(groupBy(BUBBLE_STYLES)).map(([g, xs]) => (
                  <optgroup key={g} label={g}>{xs.map((b) => <option key={b.v} value={b.v}>{b.l}</option>)}</optgroup>
                ))}
              </select>
            </label>
            {it.style === 'system' && (
              <label className="ed-text"><span>상태창 제목 (비우면 숨김)</span>
                <input className="ed-input" value={it.title || ''} maxLength={30} onChange={(e) => updateItem({ title: e.target.value }, 'debounce')} />
              </label>
            )}
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
              {num('글자 크기', 'fontSize', { min: 8, max: 400 })}
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
            {colorField('외곽선 (효과음)', 'outline', true)}
            {it.outline && num('외곽선 두께', 'outlineWidth', { min: 1, max: 60 })}
            <label className="ed-range"><span>기울기 {it.skew || 0}°</span><input type="range" min="-35" max="35" value={it.skew || 0} onChange={(e) => updateItem({ skew: Number(e.target.value) }, 'debounce')} /></label>
            <label className="ed-range"><span>자간 {it.spacing || 0}px</span><input type="range" min="-10" max="40" value={it.spacing || 0} onChange={(e) => updateItem({ spacing: Number(e.target.value) }, 'debounce')} /></label>
            <label className="ed-check"><input type="checkbox" checked={!!it.shadow} onChange={(e) => updateItem({ shadow: e.target.checked })} /> 그림자</label>
          </>
        )}
        {(it.type === 'bubble' || it.type === 'frame' || it.type === 'decor') && (
          <>
            {colorField('채우기', 'fill', it.type !== 'bubble')}
            {it.type === 'decor' && it.shape === 'gradient' ? colorField('끝 색', 'color2', true) : colorField(it.type === 'bubble' && it.style === 'system' ? '빛나는 테두리 색' : '선 색', 'stroke')}
            {num(it.type === 'decor' && it.shape === 'tone' ? '점 간격' : '선 두께', 'strokeWidth', { min: 0, max: 60, step: 0.5 })}
          </>
        )}
        {it.type === 'decor' && (
          <label className="ed-select"><span>모양</span>
            <select value={it.shape} onChange={(e) => updateItem(decorPreset(e.target.value, it.fill))}>
              {Object.entries(groupBy(DECOR_SHAPES)).map(([g, xs]) => (
                <optgroup key={g} label={g}>{xs.map((s) => <option key={s.v} value={s.v}>{s.l}</option>)}</optgroup>
              ))}
            </select>
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
          <button type="button" className="ed-btn" onClick={duplicateSelected} disabled={locked}>복제 (Ctrl+D)</button>
          <button type="button" className="ed-btn danger" onClick={deleteSelected} disabled={locked}>삭제 (Del)</button>
        </div>
      </div>
    );
  };

  const layersPanel = () => {
    const al = d.layers.find((x) => x.id === activeLayerId);
    const isBottom = al && d.layers[0].id === al.id;
    return (
      <div className="ed-group">
        <div className="ed-layers-head">
          <h4>레이어 {d.layers.length}/{MAX_LAYERS}</h4>
        </div>
        <div className="ed-add-layer">
          <select value={layerPreset} onChange={(e) => setLayerPreset(e.target.value)} aria-label="새 레이어 종류">
            {LAYER_PRESETS.map((p) => <option key={p.v} value={p.v}>{p.l}</option>)}
          </select>
          <button type="button" className="ed-btn primary" onClick={() => addLayer()}>+ 추가</button>
        </div>
        <ul className="ed-layers">
          {[...d.layers].reverse().map((l) => (
            <li key={l.id} className={`${l.id === activeLayerId ? 'on' : ''} ${l.clip ? 'clipped' : ''}`}>
              <button type="button" className="ed-eye" aria-label={l.visible ? '레이어 숨기기' : '레이어 보이기'} onClick={() => patchLayer(l.id, { visible: !l.visible })}>{l.visible ? '👁' : '—'}</button>
              <button type="button" className="ed-layer-name" onClick={() => { setActiveLayerId(l.id); activeRef.current = l.id; bump(); }}
                onDoubleClick={() => { const n = window.prompt('레이어 이름', l.name); if (n && n.trim()) patchLayer(l.id, { name: n.trim().slice(0, 30) }); }}>
                {l.clip && <span className="ed-clip-mark" title="클리핑">↳</span>}
                {l.name}
                <small>
                  {l.blend !== 'normal' ? ` · ${BLEND_MODES.find((b) => b.v === l.blend)?.l.split(' ')[0]}` : ''}
                  {l.locked ? ' · 🔒' : ''}{l.alphaLock ? ' · 투명도잠금' : ''}
                  {l.items.length ? ` · 아이템 ${l.items.length}` : ''}
                </small>
              </button>
              <button type="button" className="ed-mini" onClick={() => moveLayer(l.id, 'up')} aria-label="위로">▲</button>
              <button type="button" className="ed-mini" onClick={() => moveLayer(l.id, 'down')} aria-label="아래로">▼</button>
            </li>
          ))}
        </ul>
        {al && (
          <div className="ed-layer-opts">
            <label className="ed-select"><span>혼합 모드</span>
              <select value={al.blend} onChange={(e) => patchLayer(al.id, { blend: e.target.value })}>
                {BLEND_MODES.map((b) => <option key={b.v} value={b.v}>{b.l}</option>)}
              </select>
            </label>
            <label className="ed-range"><span>불투명도 {Math.round(al.opacity * 100)}%</span>
              <input type="range" min="0" max="100" value={Math.round(al.opacity * 100)} onChange={(e) => patchLayer(al.id, { opacity: Number(e.target.value) / 100 }, 'debounce')} />
            </label>
            <div className="ed-checks">
              <label className="ed-check" title={isBottom ? '맨 아래 레이어는 클리핑할 수 없어요' : '바로 아래 레이어에 그린 부분 안에서만 보여요'}>
                <input type="checkbox" checked={!!al.clip} disabled={isBottom} onChange={(e) => patchLayer(al.id, { clip: e.target.checked })} /> 아래 레이어에 클리핑
              </label>
              <label className="ed-check" title="이미 그린 부분 위에만 칠해져요 (명암·채색 수정에 편해요)">
                <input type="checkbox" checked={!!al.alphaLock} onChange={(e) => patchLayer(al.id, { alphaLock: e.target.checked })} /> 투명도 잠금
              </label>
              <label className="ed-check" title="그리기·아이템 이동을 막아요">
                <input type="checkbox" checked={!!al.locked} onChange={(e) => patchLayer(al.id, { locked: e.target.checked })} /> 레이어 잠금
              </label>
            </div>
            <div className="ed-row">
              <button type="button" className="ed-btn" onClick={() => { const n = window.prompt('레이어 이름', al.name); if (n && n.trim()) patchLayer(al.id, { name: n.trim().slice(0, 30) }); }}>이름 변경</button>
              <button type="button" className="ed-btn" onClick={() => duplicateLayer(al.id)}>복제</button>
            </div>
            <div className="ed-row">
              <button type="button" className="ed-btn" onClick={() => mergeDown(al.id)} disabled={isBottom}>아래로 합치기</button>
              <button type="button" className="ed-btn" onClick={() => clearLayerPixels(al.id)}>그림 지우기</button>
            </div>
            <button type="button" className="ed-btn danger" onClick={() => deleteLayer(al.id)}>레이어 삭제</button>
          </div>
        )}
      </div>
    );
  };

  const canvasPanel = () => (
    <div className="ed-group">
      <h4>캔버스 크기</h4>
      <div className="ed-row">
        <label className="ed-num"><span>가로</span><input type="number" value={sizeForm.w} onChange={(e) => setSizeForm({ ...sizeForm, w: e.target.value })} /></label>
        <label className="ed-num"><span>세로</span><input type="number" value={sizeForm.h} onChange={(e) => setSizeForm({ ...sizeForm, h: e.target.value })} /></label>
      </div>
      <button type="button" className="ed-btn primary" onClick={() => resizeCanvas(sizeForm.w, sizeForm.h)}>크기 적용</button>
      <div className="ed-row">
        <button type="button" className="ed-btn" onClick={() => resizeCanvas(d.width, d.height + Math.round(d.width * 1.6))}>아래로 길게 늘리기</button>
      </div>
      <div className="ed-presets">
        {PAGE_PRESETS.map((p) => <button key={p.l} type="button" className="ed-btn" onClick={() => resizeCanvas(p.w, p.h)}>{p.l}</button>)}
      </div>
      <p className="ed-hint">세로는 최대 {MAX_DOC_HEIGHT.toLocaleString()}px 까지 늘릴 수 있어요. 크기를 줄이면 바깥 그림은 잘려요 (실행 취소로 되돌리기 가능).</p>
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
          <button type="button" className="ed-mini" onClick={undo} disabled={h.index <= 0} title="실행 취소 (Ctrl+Z)" aria-label="실행 취소">↶<span className="ed-lbl"> 실행 취소</span></button>
          <button type="button" className="ed-mini" onClick={redo} disabled={h.index >= h.list.length - 1} title="다시 실행 (Ctrl+Shift+Z)" aria-label="다시 실행">↷<span className="ed-lbl"> 다시 실행</span></button>
          <span className="ed-spacer" />
          <button type="button" className="ed-mini" onClick={() => setZoom((z) => z / 1.25)} aria-label="축소">−</button>
          <button type="button" className="ed-mini ed-zoom" onClick={fitZoom} title="화면 너비에 맞추기">{Math.round(zoom * 100)}%</button>
          <button type="button" className="ed-mini" onClick={() => setZoom((z) => z * 1.25)} aria-label="확대">+</button>
          <button type="button" className="ed-mini ed-z100" onClick={() => setZoom(1)}>100%</button>
          {d && <span className="ed-size">{d.width}×{d.height.toLocaleString()}</span>}
          <button type="button" className="ed-mini ed-panel-toggle" onClick={() => setPanelOpen((v) => !v)}>{panelOpen ? '닫기' : '속성·레이어'}</button>
        </div>
        <div className="ed-viewport">
          <div className="ed-scroller" ref={scrollRef}>
            {d && L && <div className="ed-spacer-box" style={{ width: d.width * zoom + L.offX * 2, height: d.height * zoom + PAD * 2 }} />}
          </div>
          <canvas
            ref={canvasRef}
            className={`ed-canvas tool-${tool}`}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onContextMenu={(e) => e.preventDefault()}
          />
          {!ready && <div className="ed-loading abs">편집기를 준비하는 중…</div>}
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
