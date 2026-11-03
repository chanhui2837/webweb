// 웹웹 편집기 코어 — 아이템 그리기/판정/직렬화. React 와 독립된 순수 캔버스 로직.

export const FONTS = [
  { v: '"Pretendard Variable", Pretendard, sans-serif', l: '프리텐다드 (기본)' },
  { v: '"Nanum Pen Script", cursive', l: '나눔손글씨 펜' },
  { v: '"Black Han Sans", sans-serif', l: '검은고딕 (효과음)' },
  { v: '"Gowun Batang", serif', l: '고운바탕 (나레이션)' },
  { v: '"Jua", sans-serif', l: '주아 (귀여운)' },
  { v: 'monospace', l: '고정폭' },
];

export const BUBBLE_STYLES = [
  { v: 'round', l: '말풍선' },
  { v: 'thought', l: '생각 풍선' },
  { v: 'shout', l: '외침 풍선' },
  { v: 'box', l: '사각 대사상자' },
  { v: 'whisper', l: '속삭임(점선)' },
];

export const DECOR_SHAPES = [
  { v: 'rect', l: '사각형' },
  { v: 'ellipse', l: '원' },
  { v: 'star', l: '별' },
  { v: 'heart', l: '하트' },
  { v: 'burst', l: '폭발' },
  { v: 'sparkle', l: '반짝이' },
  { v: 'tone', l: '스크린톤' },
  { v: 'gradient', l: '그라데이션' },
];

let idSeq = 0;
export const uid = (p = 'i') => `${p}${Date.now().toString(36)}${(idSeq++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---------------- 아이템 기본값 ---------------- */
export function createItem(type, x, y, w, h, extra = {}) {
  const base = { id: uid(), type, x, y, w: Math.max(10, w), h: Math.max(10, h), opacity: 1 };
  switch (type) {
    case 'bubble':
      return {
        ...base, style: 'round', text: '대사를 입력하세요', font: FONTS[0].v, fontSize: 26, bold: false,
        color: '#111111', fill: '#ffffff', stroke: '#111111', strokeWidth: 3, tail: true,
        tailX: x + w * 0.3, tailY: y + h + Math.max(30, h * 0.45), ...extra,
      };
    case 'text':
      return { ...base, text: '텍스트', font: FONTS[0].v, fontSize: 32, bold: true, color: '#111111', align: 'center', outline: '', outlineWidth: 6, ...extra };
    case 'frame':
      return { ...base, stroke: '#111111', strokeWidth: 6, fill: '', radius: 0, ...extra };
    case 'speed':
      return { ...base, color: '#111111', angle: 0, density: 40, lineWidth: 2, seed: Math.floor(Math.random() * 1e9), ...extra };
    case 'focus':
      return { ...base, color: '#111111', density: 90, inner: 0.45, seed: Math.floor(Math.random() * 1e9), ...extra };
    case 'decor':
      return { ...base, shape: 'star', fill: '#FFD23F', stroke: '#111111', strokeWidth: 3, color2: '#ffffff', ...extra };
    case 'image':
      return { ...base, src: '', ...extra };
    default:
      return base;
  }
}

/* ---------------- 텍스트 줄바꿈 ---------------- */
function wrapLines(ctx, text, maxW) {
  const out = [];
  for (const para of String(text || '').split('\n')) {
    if (!para) { out.push(''); continue; }
    const words = para.split(/(\s+)/);
    let line = '';
    for (const word of words) {
      const test = line + word;
      if (ctx.measureText(test).width <= maxW || !line) {
        if (ctx.measureText(word).width > maxW && !line.trim()) {
          // 너무 긴 단어(한글 문장 등)는 글자 단위로 자른다
          for (const ch of word) {
            if (ctx.measureText(line + ch).width > maxW && line) { out.push(line); line = ch; } else line += ch;
          }
        } else line = test;
      } else {
        out.push(line.trimEnd());
        line = word.trimStart();
        if (ctx.measureText(line).width > maxW) {
          let tmp = '';
          for (const ch of line) {
            if (ctx.measureText(tmp + ch).width > maxW && tmp) { out.push(tmp); tmp = ch; } else tmp += ch;
          }
          line = tmp;
        }
      }
    }
    out.push(line.trimEnd());
  }
  return out;
}

function fontStr(it) {
  return `${it.bold ? '800' : '500'} ${it.fontSize}px ${it.font}`;
}

function drawTextBlock(ctx, it, bx, by, bw, bh, align = 'center') {
  ctx.font = fontStr(it);
  ctx.textBaseline = 'middle';
  const lines = wrapLines(ctx, it.text, Math.max(10, bw));
  const lh = it.fontSize * 1.28;
  const total = lines.length * lh;
  let y = by + bh / 2 - total / 2 + lh / 2;
  ctx.textAlign = align;
  const tx = align === 'left' ? bx : align === 'right' ? bx + bw : bx + bw / 2;
  for (const line of lines) {
    if (it.outline) {
      ctx.lineJoin = 'round';
      ctx.lineWidth = it.outlineWidth || 6;
      ctx.strokeStyle = it.outline;
      ctx.strokeText(line, tx, y);
    }
    ctx.fillStyle = it.color;
    ctx.fillText(line, tx, y);
    y += lh;
  }
}

/* ---------------- 말풍선 ---------------- */
function tailBase(cx, cy, rx, ry, tx, ty, spread = 0.22) {
  const ang = Math.atan2((ty - cy) / ry, (tx - cx) / rx);
  const a1 = ang - spread;
  const a2 = ang + spread;
  return [
    [cx + Math.cos(a1) * rx * 0.85, cy + Math.sin(a1) * ry * 0.85],
    [cx + Math.cos(a2) * rx * 0.85, cy + Math.sin(a2) * ry * 0.85],
  ];
}

function bubbleBodyPath(ctx, it) {
  const cx = it.x + it.w / 2;
  const cy = it.y + it.h / 2;
  const rx = it.w / 2;
  const ry = it.h / 2;
  const p = new Path2D();
  if (it.style === 'box') {
    p.rect(it.x, it.y, it.w, it.h);
  } else if (it.style === 'shout') {
    const rnd = mulberry32(hashStr(it.id));
    const n = 18;
    for (let i = 0; i <= n * 2; i += 1) {
      const a = (i / (n * 2)) * Math.PI * 2;
      const outer = i % 2 === 0;
      const k = outer ? 1.08 + rnd() * 0.12 : 0.8;
      const px = cx + Math.cos(a) * rx * k;
      const py = cy + Math.sin(a) * ry * k;
      if (i === 0) p.moveTo(px, py); else p.lineTo(px, py);
    }
    p.closePath();
  } else if (it.style === 'thought') {
    p.ellipse(cx, cy, rx * 0.86, ry * 0.8, 0, 0, Math.PI * 2);
    const n = 11;
    for (let i = 0; i < n; i += 1) {
      const a = (i / n) * Math.PI * 2;
      const r = Math.min(rx, ry) * 0.36;
      const px = cx + Math.cos(a) * rx * 0.78;
      const py = cy + Math.sin(a) * ry * 0.72;
      p.moveTo(px + r, py);
      p.ellipse(px, py, r, r * 0.9, 0, 0, Math.PI * 2);
    }
  } else {
    p.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  }
  return p;
}

function bubbleTailPaths(it) {
  if (!it.tail) return [];
  const cx = it.x + it.w / 2;
  const cy = it.y + it.h / 2;
  const rx = it.w / 2;
  const ry = it.h / 2;
  if (it.style === 'thought') {
    // 생각 풍선 꼬리는 작아지는 동그라미 3개
    const paths = [];
    const ang = Math.atan2((it.tailY - cy) / ry, (it.tailX - cx) / rx);
    const sx = cx + Math.cos(ang) * rx * 0.95;
    const sy = cy + Math.sin(ang) * ry * 0.95;
    const base = Math.min(rx, ry) * 0.2;
    [0.25, 0.58, 0.92].forEach((t, i) => {
      const px = sx + (it.tailX - sx) * t;
      const py = sy + (it.tailY - sy) * t;
      const r = Math.max(3, base * (1 - i * 0.3));
      const p = new Path2D();
      p.ellipse(px, py, r, r, 0, 0, Math.PI * 2);
      paths.push(p);
    });
    return paths;
  }
  const p = new Path2D();
  if (it.style === 'box') {
    const bx = Math.min(Math.max(it.tailX, it.x + it.w * 0.2), it.x + it.w * 0.8);
    const below = it.tailY > cy;
    const edgeY = below ? it.y + it.h - 1 : it.y + 1;
    const half = Math.min(it.w * 0.08, 18);
    p.moveTo(bx - half, edgeY);
    p.lineTo(it.tailX, it.tailY);
    p.lineTo(bx + half, edgeY);
    p.closePath();
    return [p];
  }
  const [b1, b2] = tailBase(cx, cy, rx, ry, it.tailX, it.tailY, it.style === 'shout' ? 0.16 : 0.2);
  p.moveTo(b1[0], b1[1]);
  if (it.style === 'shout') p.lineTo(it.tailX, it.tailY);
  else p.quadraticCurveTo((b1[0] + it.tailX) / 2, (b1[1] + it.tailY) / 2, it.tailX, it.tailY);
  p.lineTo(b2[0], b2[1]);
  p.closePath();
  return [p];
}

function drawBubble(ctx, it) {
  const body = bubbleBodyPath(ctx, it);
  const tails = bubbleTailPaths(it);
  const sw = it.strokeWidth || 0;
  ctx.lineJoin = 'round';
  if (it.style === 'whisper') ctx.setLineDash([sw * 3, sw * 2.4]);
  if (sw > 0) {
    // 외곽선 합성 트릭: 두 배 굵기로 먼저 그리고 채우기로 안쪽 절반을 덮어 하나의 실루엣처럼 보이게 함
    ctx.strokeStyle = it.stroke;
    ctx.lineWidth = sw * 2;
    ctx.stroke(body);
    tails.forEach((t) => ctx.stroke(t));
  }
  ctx.setLineDash([]);
  ctx.fillStyle = it.fill || 'rgba(0,0,0,0)';
  ctx.fill(body, 'nonzero');
  tails.forEach((t) => ctx.fill(t));
  // 텍스트 영역
  const pad = it.style === 'box' ? 0.86 : it.style === 'shout' ? 0.62 : 0.72;
  const iw = it.w * pad;
  const ih = it.h * (it.style === 'box' ? 0.86 : 0.7);
  drawTextBlock(ctx, it, it.x + (it.w - iw) / 2, it.y + (it.h - ih) / 2, iw, ih, 'center');
}

/* ---------------- 효과선 / 집중선 ---------------- */
function drawSpeed(ctx, it) {
  const rnd = mulberry32(it.seed || 1);
  ctx.save();
  ctx.beginPath();
  ctx.rect(it.x, it.y, it.w, it.h);
  ctx.clip();
  const cx = it.x + it.w / 2;
  const cy = it.y + it.h / 2;
  ctx.translate(cx, cy);
  ctx.rotate(((it.angle || 0) * Math.PI) / 180);
  const diag = Math.hypot(it.w, it.h);
  ctx.strokeStyle = it.color;
  ctx.lineCap = 'round';
  const n = Math.max(3, Math.round(it.density));
  for (let i = 0; i < n; i += 1) {
    const yy = -diag / 2 + rnd() * diag;
    const len = diag * (0.3 + rnd() * 0.6);
    const xx = -diag / 2 + rnd() * (diag - len);
    ctx.lineWidth = (it.lineWidth || 2) * (0.4 + rnd() * 1.2);
    ctx.beginPath();
    ctx.moveTo(xx, yy);
    ctx.lineTo(xx + len, yy);
    ctx.stroke();
  }
  ctx.restore();
}

function drawFocus(ctx, it) {
  const rnd = mulberry32(it.seed || 1);
  ctx.save();
  ctx.beginPath();
  ctx.rect(it.x, it.y, it.w, it.h);
  ctx.clip();
  const cx = it.x + it.w / 2;
  const cy = it.y + it.h / 2;
  const R = Math.hypot(it.w, it.h) / 2 + 4;
  const irx = (it.w / 2) * (it.inner ?? 0.45);
  const iry = (it.h / 2) * (it.inner ?? 0.45);
  ctx.fillStyle = it.color;
  const n = Math.max(8, Math.round(it.density));
  for (let i = 0; i < n; i += 1) {
    const a = (i / n) * Math.PI * 2 + rnd() * 0.05;
    const jitter = 0.85 + rnd() * 0.5;
    const ix = cx + Math.cos(a) * irx * jitter;
    const iy = cy + Math.sin(a) * iry * jitter;
    const wdt = 0.006 + rnd() * 0.018;
    ctx.beginPath();
    ctx.moveTo(ix, iy);
    ctx.lineTo(cx + Math.cos(a - wdt) * R, cy + Math.sin(a - wdt) * R);
    ctx.lineTo(cx + Math.cos(a + wdt) * R, cy + Math.sin(a + wdt) * R);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

/* ---------------- 장식 도형 ---------------- */
function starPath(cx, cy, ro, ri, n) {
  const p = new Path2D();
  for (let i = 0; i < n * 2; i += 1) {
    const a = (i / (n * 2)) * Math.PI * 2 - Math.PI / 2;
    const r = i % 2 === 0 ? ro : ri;
    const fn = i === 0 ? 'moveTo' : 'lineTo';
    p[fn](cx + Math.cos(a) * r, cy + Math.sin(a) * r);
  }
  p.closePath();
  return p;
}

function drawDecor(ctx, it) {
  const { x, y, w, h } = it;
  const cx = x + w / 2;
  const cy = y + h / 2;
  let p = new Path2D();
  if (it.shape === 'tone') {
    ctx.save();
    ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    ctx.fillStyle = it.fill;
    const step = Math.max(4, it.strokeWidth * 3 || 9);
    for (let yy = y; yy < y + h + step; yy += step) {
      const odd = Math.round((yy - y) / step) % 2;
      for (let xx = x + (odd ? step / 2 : 0); xx < x + w + step; xx += step) {
        ctx.beginPath(); ctx.arc(xx, yy, step * 0.28, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.restore();
    return;
  }
  if (it.shape === 'gradient') {
    const g = ctx.createLinearGradient(x, y, x, y + h);
    g.addColorStop(0, it.fill);
    g.addColorStop(1, it.color2 || 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x, y, w, h);
    return;
  }
  if (it.shape === 'rect') p.rect(x, y, w, h);
  else if (it.shape === 'ellipse') p.ellipse(cx, cy, w / 2, h / 2, 0, 0, Math.PI * 2);
  else if (it.shape === 'star') {
    p = new Path2D();
    const s = starPath(0, 0, 1, 0.45, 5);
    const m = new DOMMatrix().translate(cx, cy).scale(w / 2, h / 2);
    p.addPath(s, m);
  } else if (it.shape === 'sparkle') {
    p = new Path2D();
    const s = starPath(0, 0, 1, 0.18, 4);
    p.addPath(s, new DOMMatrix().translate(cx, cy).scale(w / 2, h / 2));
  } else if (it.shape === 'burst') {
    p = new Path2D();
    const s = starPath(0, 0, 1, 0.68, 14);
    p.addPath(s, new DOMMatrix().translate(cx, cy).scale(w / 2, h / 2));
  } else if (it.shape === 'heart') {
    p.moveTo(cx, y + h * 0.3);
    p.bezierCurveTo(cx, y, x, y, x, y + h * 0.32);
    p.bezierCurveTo(x, y + h * 0.62, cx, y + h * 0.8, cx, y + h);
    p.bezierCurveTo(cx, y + h * 0.8, x + w, y + h * 0.62, x + w, y + h * 0.32);
    p.bezierCurveTo(x + w, y, cx, y, cx, y + h * 0.3);
    p.closePath();
  }
  if (it.fill) { ctx.fillStyle = it.fill; ctx.fill(p); }
  if (it.strokeWidth > 0) { ctx.lineJoin = 'round'; ctx.lineWidth = it.strokeWidth; ctx.strokeStyle = it.stroke; ctx.stroke(p); }
}

function drawFrame(ctx, it) {
  const r = Math.min(it.radius || 0, it.w / 2, it.h / 2);
  const p = new Path2D();
  if (r > 0 && p.roundRect) p.roundRect(it.x, it.y, it.w, it.h, r); else p.rect(it.x, it.y, it.w, it.h);
  if (it.fill) { ctx.fillStyle = it.fill; ctx.fill(p); }
  if (it.strokeWidth > 0) { ctx.lineWidth = it.strokeWidth; ctx.strokeStyle = it.stroke; ctx.lineJoin = 'miter'; ctx.stroke(p); }
}

/* ---------------- 이미지 캐시 ---------------- */
const imageCache = new Map();
export function getImage(src, onLoad) {
  if (!src) return null;
  let rec = imageCache.get(src);
  if (!rec) {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    rec = { img, loaded: false, error: false, waiters: new Set() };
    imageCache.set(src, rec);
    img.onload = () => { rec.loaded = true; rec.waiters.forEach((f) => f()); rec.waiters.clear(); };
    img.onerror = () => { rec.error = true; rec.waiters.forEach((f) => f()); rec.waiters.clear(); };
    img.src = src;
  }
  if (!rec.loaded && onLoad) rec.waiters.add(onLoad);
  return rec.loaded ? rec.img : null;
}
export function loadImage(src) {
  return new Promise((resolve) => {
    const r = getImage(src, () => resolve(imageCache.get(src)?.loaded ? imageCache.get(src).img : null));
    if (r) resolve(r);
  });
}

export function drawItem(ctx, it, onImageLoad) {
  ctx.save();
  ctx.globalAlpha *= it.opacity ?? 1;
  switch (it.type) {
    case 'bubble': drawBubble(ctx, it); break;
    case 'text': drawTextBlock(ctx, it, it.x, it.y, it.w, it.h, it.align || 'center'); break;
    case 'frame': drawFrame(ctx, it); break;
    case 'speed': drawSpeed(ctx, it); break;
    case 'focus': drawFocus(ctx, it); break;
    case 'decor': drawDecor(ctx, it); break;
    case 'image': {
      const img = getImage(it.src, onImageLoad);
      if (img) ctx.drawImage(img, it.x, it.y, it.w, it.h);
      else { ctx.fillStyle = '#e8e9f2'; ctx.fillRect(it.x, it.y, it.w, it.h); }
      break;
    }
    default: break;
  }
  ctx.restore();
}

/* ---------------- 판정 ---------------- */
export function hitItem(it, px, py, tol = 0) {
  return px >= it.x - tol && px <= it.x + it.w + tol && py >= it.y - tol && py <= it.y + it.h + tol;
}

export function handlePoints(it) {
  const { x, y, w, h } = it;
  const pts = [
    ['nw', x, y], ['n', x + w / 2, y], ['ne', x + w, y], ['e', x + w, y + h / 2],
    ['se', x + w, y + h], ['s', x + w / 2, y + h], ['sw', x, y + h], ['w', x, y + h / 2],
  ];
  if (it.type === 'bubble' && it.tail) pts.push(['tail', it.tailX, it.tailY]);
  return pts;
}

export function applyResize(orig, handle, dx, dy, keepRatio) {
  let { x, y, w, h } = orig;
  if (handle.includes('e')) w = orig.w + dx;
  if (handle.includes('s')) h = orig.h + dy;
  if (handle.includes('w')) { x = orig.x + dx; w = orig.w - dx; }
  if (handle.includes('n')) { y = orig.y + dy; h = orig.h - dy; }
  if (keepRatio && handle.length === 2) {
    const r = orig.w / orig.h;
    if (Math.abs(w / r) > Math.abs(h)) { const nh = w / r; if (handle.includes('n')) y = orig.y + orig.h - nh; h = nh; } else { const nw = h * r; if (handle.includes('w')) x = orig.x + orig.w - nw; w = nw; }
  }
  if (w < 0) { x += w; w = -w; }
  if (h < 0) { y += h; h = -h; }
  return { x, y, w: Math.max(8, w), h: Math.max(8, h) };
}

export function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/* ---------------- 문서 ---------------- */
export const PAGE_PRESETS = [
  { l: '웹툰 세로 (800×1280)', w: 800, h: 1280 },
  { l: '웹툰 긴 컷 (800×2400)', w: 800, h: 2400 },
  { l: '웹툰 와이드 (1080×1920)', w: 1080, h: 1920 },
  { l: '정사각 (1200×1200)', w: 1200, h: 1200 },
  { l: '일러스트 가로 (1600×1200)', w: 1600, h: 1200 },
  { l: '일러스트 세로 (1200×1600)', w: 1200, h: 1600 },
];

export function emptyDoc(w = 800, h = 1280) {
  return { version: 1, width: w, height: h, background: '#ffffff', layers: [{ id: uid('l'), name: '레이어 1', visible: true, opacity: 1, bitmap: null, items: [] }] };
}

/** 저장된 문서 데이터를 오프스크린 캔버스에 렌더링 (업로드/미리보기용) */
export async function renderDocToCanvas(data) {
  const doc = data || emptyDoc();
  const c = document.createElement('canvas');
  c.width = doc.width;
  c.height = doc.height;
  const ctx = c.getContext('2d');
  if (doc.background) { ctx.fillStyle = doc.background; ctx.fillRect(0, 0, c.width, c.height); }
  const fontsToLoad = new Set();
  doc.layers.forEach((l) => (l.items || []).forEach((it) => { if (it.font && it.fontSize) fontsToLoad.add(`${it.bold ? '800' : '500'} ${it.fontSize}px ${it.font}`); }));
  await Promise.all([...fontsToLoad].map((f) => document.fonts?.load(f, '가A').catch(() => {})));
  for (const l of doc.layers) {
    if (!l.visible) continue;
    ctx.save();
    ctx.globalAlpha = l.opacity ?? 1;
    if (l.bitmap) {
      const img = await loadImage(l.bitmap);
      if (img) ctx.drawImage(img, 0, 0);
    }
    for (const it of l.items || []) {
      if (it.type === 'image') await loadImage(it.src);
      drawItem(ctx, it);
    }
    ctx.restore();
  }
  return c;
}

export function canvasToBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => {
      if (!b) { reject(new Error('이미지를 만들 수 없습니다. (외부 이미지 보안 제한)')); return; }
      if (b.size <= 9.5 * 1024 * 1024) { resolve(b); return; }
      canvas.toBlob((j) => (j ? resolve(j) : reject(new Error('이미지 변환 실패'))), 'image/jpeg', 0.9);
    }, 'image/png');
  });
}

/** 컷 레이아웃 프리셋 → 프레임 아이템 배열 */
export function panelLayout(kind, W, H, margin = 40, gutter = 28, sw = 6) {
  const iw = W - margin * 2;
  const ih = H - margin * 2;
  const mk = (x, y, w, h) => createItem('frame', x, y, w, h, { strokeWidth: sw });
  const rows = (n) => {
    const hh = (ih - gutter * (n - 1)) / n;
    return Array.from({ length: n }, (_, i) => mk(margin, margin + i * (hh + gutter), iw, hh));
  };
  switch (kind) {
    case 'one': return [mk(margin, margin, iw, ih)];
    case 'two': return rows(2);
    case 'three': return rows(3);
    case 'splitTop': {
      const hh = (ih - gutter) / 2;
      const ww = (iw - gutter) / 2;
      return [mk(margin, margin, ww, hh), mk(margin + ww + gutter, margin, ww, hh), mk(margin, margin + hh + gutter, iw, hh)];
    }
    case 'grid': {
      const hh = (ih - gutter) / 2;
      const ww = (iw - gutter) / 2;
      return [mk(margin, margin, ww, hh), mk(margin + ww + gutter, margin, ww, hh), mk(margin, margin + hh + gutter, ww, hh), mk(margin + ww + gutter, margin + hh + gutter, ww, hh)];
    }
    case 'stagger': {
      const hh = (ih - gutter * 2) / 3;
      const big = iw * 0.62;
      return [
        mk(margin, margin, big, hh), mk(margin + big + gutter, margin, iw - big - gutter, hh),
        mk(margin, margin + hh + gutter, iw, hh),
        mk(margin, margin + (hh + gutter) * 2, iw - big - gutter, hh), mk(margin + (iw - big), margin + (hh + gutter) * 2, big, hh),
      ];
    }
    default: return [];
  }
}

export const PANEL_LAYOUTS = [
  { v: 'one', l: '한 컷' },
  { v: 'two', l: '2단' },
  { v: 'three', l: '3단' },
  { v: 'splitTop', l: '위 2 + 아래 1' },
  { v: 'grid', l: '4칸' },
  { v: 'stagger', l: '엇갈림 5컷' },
];
