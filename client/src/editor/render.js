// 웹웹 편집기 — 타일 기반 레이어 저장 + 화면/영역 합성
// 레이어 그림은 1024×1024 타일로 나눠, 실제로 그린 곳만 메모리·DB 에 둔다.
// 덕분에 장을 계속 이어 붙여 세로로 아주 긴 캔버스를 만들어도 빈 곳은 비용이 들지 않는다.
import { drawItem, loadImage, uid } from './core.js';

export const TILE = 1024;
export const MAX_DOC_HEIGHT = 500000; // 사실상 무제한 (표준 장 약 400장 분량)
export const MAX_DOC_WIDTH = 4000;
export const SLICE_HEIGHT = 1600; // 업로드 시 긴 장을 이 높이로 잘라 여러 이미지로 올림

export const BLEND_MODES = [
  { v: 'normal', l: '표준', op: 'source-over' },
  { v: 'multiply', l: '곱하기 (명암)', op: 'multiply' },
  { v: 'screen', l: '스크린 (빛)', op: 'screen' },
  { v: 'add', l: '더하기·발광', op: 'lighter' },
  { v: 'overlay', l: '오버레이', op: 'overlay' },
  { v: 'soft-light', l: '소프트 라이트', op: 'soft-light' },
  { v: 'hard-light', l: '하드 라이트', op: 'hard-light' },
  { v: 'color-dodge', l: '색상 닷지', op: 'color-dodge' },
  { v: 'color-burn', l: '색상 번', op: 'color-burn' },
  { v: 'darken', l: '어둡게', op: 'darken' },
  { v: 'lighten', l: '밝게', op: 'lighten' },
  { v: 'difference', l: '차이', op: 'difference' },
  { v: 'hue', l: '색조', op: 'hue' },
  { v: 'saturation', l: '채도', op: 'saturation' },
  { v: 'color', l: '컬러', op: 'color' },
  { v: 'luminosity', l: '광도', op: 'luminosity' },
];
const BLEND_OP = Object.fromEntries(BLEND_MODES.map((b) => [b.v, b.op]));

/** 요즘 웹툰 작업 순서에 맞춘 레이어 종류 */
export const LAYER_PRESETS = [
  { v: 'normal', l: '일반', name: '레이어', blend: 'normal' },
  { v: 'sketch', l: '스케치 (밑그림)', name: '스케치', blend: 'normal', opacity: 0.4 },
  { v: 'line', l: '선화', name: '선화', blend: 'normal' },
  { v: 'flat', l: '밑색', name: '밑색', blend: 'normal' },
  { v: 'shade', l: '명암 (곱하기·클리핑)', name: '명암', blend: 'multiply', clip: true, opacity: 0.7 },
  { v: 'light', l: '빛 (스크린·클리핑)', name: '빛', blend: 'screen', clip: true },
  { v: 'glow', l: '발광 효과 (더하기)', name: '발광', blend: 'add' },
  { v: 'tone', l: '분위기 색 (오버레이)', name: '분위기', blend: 'overlay', opacity: 0.6 },
  { v: 'bg', l: '배경', name: '배경', blend: 'normal' },
  { v: 'fx', l: '효과선·효과음', name: '효과', blend: 'normal' },
  { v: 'text', l: '식자 (말풍선·대사)', name: '식자', blend: 'normal' },
];

export const tileKey = (tx, ty) => `${tx},${ty}`;
export function parseKey(k) {
  const [tx, ty] = k.split(',').map(Number);
  return { tx, ty };
}
export const KEY_RE = /^\d{1,2},\d{1,4}$/;

export function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}
export function cloneCanvas(src) {
  const c = makeCanvas(src.width, src.height);
  c.getContext('2d').drawImage(src, 0, 0);
  return c;
}
export function isCanvasEmpty(c) {
  const d = c.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, c.width, c.height).data;
  for (let i = 3; i < d.length; i += 64) if (d[i] !== 0) return false;
  // 듬성듬성 검사에서 놓친 점까지 정확히 확인
  for (let i = 3; i < d.length; i += 4) if (d[i] !== 0) return false;
  return true;
}

/** 사각형과 겹치는 타일 좌표 목록 */
export function tilesInRect(x, y, w, h, docW, docH) {
  const x0 = Math.max(0, Math.floor(x / TILE));
  const y0 = Math.max(0, Math.floor(y / TILE));
  const x1 = Math.min(Math.ceil(docW / TILE) - 1, Math.floor((x + w) / TILE));
  const y1 = Math.min(Math.ceil(docH / TILE) - 1, Math.floor((y + h) / TILE));
  const out = [];
  for (let ty = y0; ty <= y1; ty += 1) for (let tx = x0; tx <= x1; tx += 1) out.push([tx, ty]);
  return out;
}

function itemBounds(it) {
  let x0 = it.x;
  let y0 = it.y;
  let x1 = it.x + it.w;
  let y1 = it.y + it.h;
  if (it.type === 'bubble' && it.tail) {
    x0 = Math.min(x0, it.tailX); y0 = Math.min(y0, it.tailY); x1 = Math.max(x1, it.tailX); y1 = Math.max(y1, it.tailY);
  }
  const m = it.type === 'bubble' ? Math.max(it.w, it.h) * 0.6 : 40; // 외침 가시·플래시 선 여유
  return [x0 - m, y0 - m, x1 + m, y1 + m];
}

function drawLayerContent(bctx, layer, rect, stroke, onImageLoad) {
  for (const [k, t] of layer.tiles) {
    const { tx, ty } = parseKey(k);
    const x = tx * TILE;
    const y = ty * TILE;
    if (x > rect.x + rect.w || y > rect.y + rect.h || x + TILE < rect.x || y + TILE < rect.y) continue;
    bctx.drawImage(t, x, y);
  }
  if (stroke && stroke.layerId === layer.id) {
    bctx.save();
    bctx.globalCompositeOperation = stroke.erase ? 'destination-out' : layer.alphaLock ? 'source-atop' : 'source-over';
    bctx.globalAlpha = stroke.erase ? 1 : stroke.opacity;
    for (const [k, c] of stroke.tiles) {
      const { tx, ty } = parseKey(k);
      bctx.drawImage(c, tx * TILE, ty * TILE);
    }
    bctx.restore();
  }
  for (const it of layer.items) {
    const [x0, y0, x1, y1] = itemBounds(it);
    if (x1 < rect.x || y1 < rect.y || x0 > rect.x + rect.w || y0 > rect.y + rect.h) continue;
    drawItem(bctx, it, onImageLoad);
  }
}

function prepBuffer(buf, w, h, m) {
  if (buf.width !== w || buf.height !== h) { buf.width = w; buf.height = h; }
  const c = buf.getContext('2d');
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.globalAlpha = 1;
  c.globalCompositeOperation = 'source-over';
  c.clearRect(0, 0, w, h);
  c.setTransform(m);
  return c;
}

let checker = null;
function checkerPattern(ctx) {
  if (!checker) {
    checker = makeCanvas(16, 16);
    const c = checker.getContext('2d');
    c.fillStyle = '#ffffff'; c.fillRect(0, 0, 16, 16);
    c.fillStyle = '#ececf2'; c.fillRect(0, 0, 8, 8); c.fillRect(8, 8, 8, 8);
  }
  return ctx.createPattern(checker, 'repeat');
}

/**
 * 문서를 ctx 에 합성한다. ctx 는 이미 "문서 좌표 → 픽셀" 변환이 걸려 있어야 한다.
 * rect: 그릴 문서 영역(보이는 곳만 그리기 위한 컬링용)
 * bufs: { a, b } 레이어 합성용 캔버스(재사용)
 */
export function drawDocRegion(ctx, doc, rect, bufs, { stroke, onImageLoad, transparentChecker = false } = {}) {
  const m = ctx.getTransform();
  const W = ctx.canvas.width;
  const H = ctx.canvas.height;
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, doc.width, doc.height);
  ctx.clip();
  if (doc.background) { ctx.fillStyle = doc.background; ctx.fillRect(rect.x, rect.y, rect.w, rect.h); }
  else if (transparentChecker) { ctx.fillStyle = checkerPattern(ctx); ctx.fillRect(rect.x, rect.y, rect.w, rect.h); }
  ctx.restore();

  let baseOk = false;
  for (const layer of doc.layers) {
    if (!layer.clip) baseOk = layer.visible;
    if (!layer.visible || (layer.clip && !baseOk)) continue;
    const buf = layer.clip ? bufs.b : bufs.a;
    const bctx = prepBuffer(buf, W, H, m);
    bctx.save();
    bctx.beginPath();
    bctx.rect(0, 0, doc.width, doc.height);
    bctx.clip();
    drawLayerContent(bctx, layer, rect, stroke, onImageLoad);
    bctx.restore();
    if (layer.clip) {
      // 클리핑: 아래(기준) 레이어에 그려진 부분 안에서만 보이게
      bctx.setTransform(1, 0, 0, 1, 0, 0);
      bctx.globalCompositeOperation = 'destination-in';
      bctx.drawImage(bufs.a, 0, 0);
      bctx.globalCompositeOperation = 'source-over';
    }
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = layer.opacity ?? 1;
    ctx.globalCompositeOperation = BLEND_OP[layer.blend] || 'source-over';
    ctx.drawImage(buf, 0, 0);
    ctx.restore();
  }
}

/** 문서의 일부 영역(x,y,w,h)을 1:1 로 렌더링한 캔버스 */
export function renderRegion(doc, x, y, w, h, scale = 1) {
  const c = makeCanvas(Math.max(1, Math.round(w * scale)), Math.max(1, Math.round(h * scale)));
  const ctx = c.getContext('2d');
  ctx.setTransform(scale, 0, 0, scale, -x * scale, -y * scale);
  drawDocRegion(ctx, doc, { x, y, w, h }, { a: makeCanvas(1, 1), b: makeCanvas(1, 1) });
  return c;
}

/** 긴 장을 SLICE_HEIGHT 단위로 잘라 순서대로 캔버스를 돌려준다 */
export function* sliceDoc(doc, sliceH = SLICE_HEIGHT) {
  for (let y = 0; y < doc.height; y += sliceH) {
    const h = Math.min(sliceH, doc.height - y);
    yield { canvas: renderRegion(doc, 0, y, doc.width, h), y, h };
  }
}

export function canvasToBlobSafe(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => {
      if (!b) { reject(new Error('이미지를 만들 수 없습니다. (외부 이미지 보안 제한)')); return; }
      if (b.size <= 9.5 * 1024 * 1024) { resolve(b); return; }
      canvas.toBlob((j) => (j ? resolve(j) : reject(new Error('이미지 변환 실패'))), 'image/jpeg', 0.9);
    }, 'image/png');
  });
}

export const LAYER_DEFAULTS = { visible: true, opacity: 1, blend: 'normal', clip: false, locked: false, alphaLock: false };

/**
 * 저장된 문서(메타 + 타일 목록)를 렌더링/편집 가능한 문서로 만든다.
 * 예전 형식(레이어 전체를 한 장의 bitmap 으로 저장)도 자동으로 타일로 바꾼다.
 */
export async function buildDoc(meta, tiles = []) {
  const byLayer = new Map();
  for (const t of tiles) {
    if (!byLayer.has(t.layer)) byLayer.set(t.layer, []);
    byLayer.get(t.layer).push(t);
  }
  const doc = { width: meta.width, height: meta.height, background: meta.background ?? '#ffffff', layers: [], legacy: false };
  for (const l of meta.layers) {
    const layer = { ...LAYER_DEFAULTS, ...l, items: JSON.parse(JSON.stringify(l.items || [])), tiles: new Map() };
    delete layer.bitmap;
    delete layer.tileKeys;
    if (l.bitmap) {
      doc.legacy = true;
      const img = await loadImage(l.bitmap);
      if (img) {
        for (const [tx, ty] of tilesInRect(0, 0, img.naturalWidth, img.naturalHeight, meta.width, meta.height)) {
          const c = makeCanvas(TILE, TILE);
          c.getContext('2d').drawImage(img, -tx * TILE, -ty * TILE);
          if (!isCanvasEmpty(c)) layer.tiles.set(tileKey(tx, ty), c);
        }
      }
    }
    for (const t of byLayer.get(l.id) || []) {
      const img = await loadImage(t.d);
      if (!img) continue;
      const c = makeCanvas(TILE, TILE);
      c.getContext('2d').drawImage(img, 0, 0);
      layer.tiles.set(t.key, c);
    }
    for (const it of layer.items) if (it.type === 'image') await loadImage(it.src);
    doc.layers.push(layer);
  }
  return doc;
}

/** 편집 가능한 문서 → 저장용 메타(타일 데이터 제외) */
export function docMeta(doc) {
  return {
    version: 2,
    width: doc.width,
    height: doc.height,
    background: doc.background,
    layers: doc.layers.map((l) => ({
      id: l.id, name: l.name, visible: l.visible, opacity: l.opacity, blend: l.blend, clip: !!l.clip,
      locked: !!l.locked, alphaLock: !!l.alphaLock, tileKeys: [...l.tiles.keys()], items: JSON.parse(JSON.stringify(l.items)),
    })),
  };
}

/**
 * 여러 장을 위→아래로 이어 붙여 한 장으로 합친다.
 * - 가로는 가장 넓은 장에 맞추고, 좁은 장은 가운데 정렬
 * - 같은 순서의 레이어끼리 합친다 (1번 레이어끼리, 2번 레이어끼리…). 남는 레이어는 그대로 추가
 * - 말풍선 등 아이템은 이어 붙인 위치만큼 아래로 이동
 */
export function mergeDocs(docs) {
  const W = Math.max(...docs.map((d) => d.width));
  const H = docs.reduce((s, d) => s + d.height, 0);
  if (H > MAX_DOC_HEIGHT) throw new Error(`합친 높이(${H.toLocaleString()}px)가 최대 ${MAX_DOC_HEIGHT.toLocaleString()}px 를 넘습니다.`);
  const first = docs[0];
  const out = { width: W, height: H, background: first.background, layers: [] };
  const layerCount = Math.max(...docs.map((d) => d.layers.length));
  if (layerCount > 30) throw new Error('합친 결과 레이어가 30개를 넘습니다. 레이어를 정리한 뒤 다시 시도해 주세요.');
  for (let i = 0; i < layerCount; i += 1) {
    const src = docs.find((d) => d.layers[i])?.layers[i];
    out.layers.push({ ...LAYER_DEFAULTS, ...src, items: [], tiles: new Map() });
  }
  const tileFor = (layer, tx, ty) => {
    const k = tileKey(tx, ty);
    let t = layer.tiles.get(k);
    if (!t) { t = makeCanvas(TILE, TILE); layer.tiles.set(k, t); }
    return t;
  };
  let offY = 0;
  for (const d of docs) {
    const offX = Math.round((W - d.width) / 2);
    d.layers.forEach((l, i) => {
      const target = out.layers[i];
      for (const [k, t] of l.tiles) {
        const { tx, ty } = parseKey(k);
        const sx = offX + tx * TILE;
        const sy = offY + ty * TILE;
        for (const [ntx, nty] of tilesInRect(sx, sy, TILE - 1, TILE - 1, W, H)) {
          tileFor(target, ntx, nty).getContext('2d').drawImage(t, sx - ntx * TILE, sy - nty * TILE);
        }
      }
      for (const it of l.items) {
        const c = { ...JSON.parse(JSON.stringify(it)), id: uid(), x: it.x + offX, y: it.y + offY };
        if (c.type === 'bubble') { c.tailX = it.tailX + offX; c.tailY = it.tailY + offY; }
        target.items.push(c);
      }
    });
    // 배경색이 다른 장은 그 구간만 맨 아래 레이어 뒤에 배경을 깔아 준다
    if (d !== first && d.background && d.background !== first.background && out.layers[0]) {
      for (const [tx, ty] of tilesInRect(offX, offY, d.width - 1, d.height - 1, W, H)) {
        const ctx = tileFor(out.layers[0], tx, ty).getContext('2d');
        ctx.save();
        ctx.globalCompositeOperation = 'destination-over';
        ctx.fillStyle = d.background;
        ctx.fillRect(offX - tx * TILE, offY - ty * TILE, d.width, d.height);
        ctx.restore();
      }
    }
    offY += d.height;
  }
  // 빈 타일 정리
  for (const l of out.layers) for (const [k, t] of l.tiles) if (isCanvasEmpty(t)) l.tiles.delete(k);
  return out;
}
