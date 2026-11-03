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
  { v: 'round', l: '기본 말풍선', g: '대사' },
  { v: 'rounded', l: '둥근 사각', g: '대사' },
  { v: 'thought', l: '생각 풍선', g: '대사' },
  { v: 'whisper', l: '속삭임 (점선)', g: '대사' },
  { v: 'soft', l: '무테 독백', g: '대사' },
  { v: 'double', l: '이중선 (회상)', g: '대사' },
  { v: 'shout', l: '외침', g: '감정' },
  { v: 'scream', l: '거대 외침', g: '감정' },
  { v: 'wavy', l: '떨리는 목소리', g: '감정' },
  { v: 'flash', l: '플래시 독백', g: '감정' },
  { v: 'heart', l: '하트', g: '감정' },
  { v: 'drip', l: '흘러내림 (공포)', g: '감정' },
  { v: 'box', l: '사각 대사상자', g: '상자' },
  { v: 'narration', l: '검은 나레이션', g: '상자' },
  { v: 'electric', l: '전화·기계음', g: '특수' },
  { v: 'chat', l: '메신저 채팅', g: '특수' },
  { v: 'system', l: '게임 상태창', g: '특수' },
];

/** 말풍선 종류별 기본 색·선·꼬리 */
export function bubblePreset(style, base = 26) {
  const p = { style, fill: '#ffffff', stroke: '#111111', color: '#111111', strokeWidth: 3, tail: true, title: '' };
  switch (style) {
    case 'box': return { ...p, strokeWidth: 2.5, tail: false };
    case 'narration': return { ...p, fill: '#16161c', stroke: '#16161c', color: '#ffffff', strokeWidth: 0, tail: false };
    case 'soft': return { ...p, fill: 'rgba(255,255,255,0.88)', strokeWidth: 0, tail: false };
    case 'scream': return { ...p, strokeWidth: 4, bold: true, fontSize: Math.round(base * 1.35) };
    case 'shout': return { ...p, bold: true };
    case 'flash': return { ...p, strokeWidth: 3, tail: false };
    case 'heart': return { ...p, fill: '#ffe1ec', stroke: '#e0457b', tail: false };
    case 'drip': return { ...p, fill: '#1b0f12', stroke: '#1b0f12', color: '#f3d7dc', strokeWidth: 0, tail: false };
    case 'electric': return { ...p, strokeWidth: 2.5 };
    case 'chat': return { ...p, fill: '#2f4bff', stroke: '#2f4bff', color: '#ffffff', strokeWidth: 0, fontSize: Math.round(base * 0.85) };
    case 'system': return { ...p, fill: 'rgba(8,16,36,0.86)', stroke: '#57c7ff', color: '#e8f6ff', strokeWidth: 2, tail: false, title: 'SYSTEM', fontSize: Math.round(base * 0.85), text: '[퀘스트가 도착했습니다]' };
    default: return p;
  }
}

export const DECOR_SHAPES = [
  { v: 'rect', l: '사각형', g: '도형' },
  { v: 'ellipse', l: '원', g: '도형' },
  { v: 'star', l: '별', g: '도형' },
  { v: 'heart', l: '하트', g: '도형' },
  { v: 'burst', l: '폭발', g: '도형' },
  { v: 'sparkle', l: '반짝이', g: '도형' },
  { v: 'sweat', l: '땀방울', g: '감정 기호' },
  { v: 'anger', l: '분노 마크', g: '감정 기호' },
  { v: 'blush', l: '홍조 빗금', g: '감정 기호' },
  { v: 'shine', l: '반짝반짝', g: '감정 기호' },
  { v: 'note', l: '음표', g: '감정 기호' },
  { v: 'gloom', l: '우울 세로선', g: '감정 기호' },
  { v: 'tone', l: '스크린톤', g: '배경' },
  { v: 'gradient', l: '그라데이션', g: '배경' },
  { v: 'flashbg', l: '베타 플래시', g: '배경' },
  { v: 'lightning', l: '번개', g: '배경' },
  { v: 'phone', l: '스마트폰 화면', g: '배경' },
];

/** 장식 종류별 기본 색 */
export function decorPreset(shape, color) {
  switch (shape) {
    case 'tone': return { shape, fill: '#111111', stroke: '#111111', strokeWidth: 3 };
    case 'gradient': return { shape, fill: color || '#2f4bff', color2: 'rgba(255,255,255,0)', strokeWidth: 0 };
    case 'flashbg': return { shape, fill: '#ffffff', stroke: '#111111', strokeWidth: 1.5 };
    case 'lightning': return { shape, fill: '#fff6a8', stroke: '#111111', strokeWidth: 3 };
    case 'phone': return { shape, fill: '#f3f5fb', stroke: '#16161c', strokeWidth: 10 };
    case 'sweat': return { shape, fill: '#bfe6ff', stroke: '#111111', strokeWidth: 2.5 };
    case 'anger': return { shape, fill: '', stroke: '#e2334f', strokeWidth: 6 };
    case 'blush': return { shape, fill: '', stroke: '#ff6f91', strokeWidth: 4 };
    case 'shine': return { shape, fill: '#ffffff', stroke: '#111111', strokeWidth: 2 };
    case 'note': return { shape, fill: '#111111', stroke: '#111111', strokeWidth: 3 };
    case 'gloom': return { shape, fill: '', stroke: '#3a3d55', strokeWidth: 2 };
    default: return { shape, fill: '#FFD23F', stroke: '#111111', strokeWidth: 3 };
  }
}

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
        ...base, style: 'round', text: '대사를 입력하세요', font: FONTS[0].v, fontSize: 26, bold: false, title: '', align: 'center',
        color: '#111111', fill: '#ffffff', stroke: '#111111', strokeWidth: 3, tail: true,
        tailX: x + w * 0.3, tailY: y + h + Math.max(30, h * 0.45), ...extra,
      };
    case 'text':
      return { ...base, text: '텍스트', font: FONTS[0].v, fontSize: 32, bold: true, color: '#111111', align: 'center', outline: '', outlineWidth: 6, skew: 0, shadow: false, spacing: 0, ...extra };
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
  ctx.save();
  ctx.font = fontStr(it);
  ctx.textBaseline = 'middle';
  if ('letterSpacing' in ctx) ctx.letterSpacing = `${it.spacing || 0}px`;
  if (it.skew) {
    // 효과음용 기울임: 상자 가운데를 기준으로 옆으로 기울인다
    const cx = bx + bw / 2;
    const cy = by + bh / 2;
    ctx.translate(cx, cy);
    ctx.transform(1, 0, Math.tan((-it.skew * Math.PI) / 180), 1, 0, 0);
    ctx.translate(-cx, -cy);
  }
  const lines = wrapLines(ctx, it.text, Math.max(10, bw));
  const lh = it.fontSize * 1.28;
  const total = lines.length * lh;
  let y = by + bh / 2 - total / 2 + lh / 2;
  ctx.textAlign = align;
  const tx = align === 'left' ? bx : align === 'right' ? bx + bw : bx + bw / 2;
  const sh = Math.max(2, it.fontSize * 0.07);
  for (const line of lines) {
    if (it.shadow) {
      ctx.fillStyle = 'rgba(0,0,0,.55)';
      if (it.outline) { ctx.lineJoin = 'round'; ctx.lineWidth = it.outlineWidth || 6; ctx.strokeStyle = 'rgba(0,0,0,.55)'; ctx.strokeText(line, tx + sh, y + sh); }
      ctx.fillText(line, tx + sh, y + sh);
    }
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
  ctx.restore();
}

/* ---------------- 말풍선 ---------------- */
// 요즘 웹툰에서 쓰이는 말풍선 형식들
const RECTISH = new Set(['box', 'rounded', 'narration', 'soft', 'chat', 'system', 'drip']);

function rrPath(p, x, y, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  p.moveTo(x + r, y);
  p.lineTo(x + w - r, y);
  p.arcTo(x + w, y, x + w, y + r, r);
  p.lineTo(x + w, y + h - r);
  p.arcTo(x + w, y + h, x + w - r, y + h, r);
  p.lineTo(x + r, y + h);
  p.arcTo(x, y + h, x, y + h - r, r);
  p.lineTo(x, y + r);
  p.arcTo(x, y, x + r, y, r);
  p.closePath();
}

function bubbleRadius(it) {
  const m = Math.min(it.w, it.h);
  if (it.style === 'rounded') return m * 0.38;
  if (it.style === 'soft') return m * 0.3;
  if (it.style === 'chat') return Math.min(m * 0.42, 34);
  if (it.style === 'system') return 4;
  if (it.style === 'drip') return m * 0.18;
  return 0;
}

function bubbleBodyPath(ctx, it) {
  const cx = it.x + it.w / 2;
  const cy = it.y + it.h / 2;
  const rx = it.w / 2;
  const ry = it.h / 2;
  const p = new Path2D();
  const rnd = mulberry32(hashStr(it.id));
  const poly = (n, fk) => {
    for (let i = 0; i <= n; i += 1) {
      const a = (i / n) * Math.PI * 2;
      const k = fk(i, a);
      const px = cx + Math.cos(a) * rx * k;
      const py = cy + Math.sin(a) * ry * k;
      if (i === 0) p.moveTo(px, py); else p.lineTo(px, py);
    }
    p.closePath();
  };
  switch (it.style) {
    case 'box':
    case 'narration':
      p.rect(it.x, it.y, it.w, it.h);
      break;
    case 'rounded':
    case 'soft':
    case 'chat':
    case 'system':
      rrPath(p, it.x, it.y, it.w, it.h, bubbleRadius(it));
      break;
    case 'drip': {
      // 공포물의 흘러내리는 말풍선: 아래쪽에 물방울이 늘어진다
      const r = bubbleRadius(it);
      const { x, y, w, h } = it;
      p.moveTo(x + r, y);
      p.lineTo(x + w - r, y);
      p.arcTo(x + w, y, x + w, y + r, r);
      p.lineTo(x + w, y + h - r);
      p.arcTo(x + w, y + h, x + w - r, y + h, r);
      const drips = 4;
      for (let i = drips; i >= 1; i -= 1) {
        const dx = x + r + ((w - 2 * r) * i) / (drips + 1);
        const dw = Math.max(6, w * 0.035);
        const dl = h * (0.18 + rnd() * 0.32);
        p.lineTo(dx + dw, y + h);
        p.quadraticCurveTo(dx + dw, y + h + dl, dx, y + h + dl);
        p.quadraticCurveTo(dx - dw, y + h + dl, dx - dw, y + h);
      }
      p.lineTo(x + r, y + h);
      p.arcTo(x, y + h, x, y + h - r, r);
      p.lineTo(x, y + r);
      p.arcTo(x, y, x + r, y, r);
      p.closePath();
      break;
    }
    case 'shout':
      poly(36, (i) => (i % 2 === 0 ? 1.08 + rnd() * 0.12 : 0.8));
      break;
    case 'scream':
      // 거대 외침: 길고 불규칙한 가시
      poly(26, (i) => (i % 2 === 0 ? 1.25 + rnd() * 0.3 : 0.78 + rnd() * 0.06));
      break;
    case 'electric':
      // 전화·무전·기계음: 잔 톱니 테두리
      poly(96, (i) => (i % 2 === 0 ? 1.02 : 0.93));
      break;
    case 'wavy':
      // 떨리는 목소리·공포: 물결치는 테두리
      poly(180, (i, a) => 1 + 0.045 * Math.sin(a * 16) + 0.02 * Math.sin(a * 7 + 1));
      break;
    case 'heart': {
      const { x, y, w, h } = it;
      p.moveTo(cx, y + h * 0.25);
      p.bezierCurveTo(cx, y - h * 0.05, x - w * 0.02, y - h * 0.02, x, y + h * 0.33);
      p.bezierCurveTo(x + w * 0.02, y + h * 0.66, cx - w * 0.12, y + h * 0.82, cx, y + h);
      p.bezierCurveTo(cx + w * 0.12, y + h * 0.82, x + w * 0.98, y + h * 0.66, x + w, y + h * 0.33);
      p.bezierCurveTo(x + w * 1.02, y - h * 0.02, cx, y - h * 0.05, cx, y + h * 0.25);
      p.closePath();
      break;
    }
    case 'thought': {
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
      break;
    }
    default: // round, whisper, double, flash
      p.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  }
  return p;
}

function rectTailBase(it, half) {
  // 사각 계열: 꼬리 끝이 향하는 변에서 꼬리가 나온다
  const cx = it.x + it.w / 2;
  const cy = it.y + it.h / 2;
  const dx = (it.tailX - cx) / it.w;
  const dy = (it.tailY - cy) / it.h;
  const r = bubbleRadius(it);
  if (Math.abs(dy) >= Math.abs(dx)) {
    const ey = dy > 0 ? it.y + it.h - 1 : it.y + 1;
    const bx = Math.min(Math.max(it.tailX, it.x + r + half), it.x + it.w - r - half);
    return [[bx - half, ey], [bx + half, ey]];
  }
  const ex = dx > 0 ? it.x + it.w - 1 : it.x + 1;
  const by = Math.min(Math.max(it.tailY, it.y + r + half), it.y + it.h - r - half);
  return [[ex, by - half], [ex, by + half]];
}

function bubbleTailPaths(it) {
  if (!it.tail) return [];
  const cx = it.x + it.w / 2;
  const cy = it.y + it.h / 2;
  const rx = it.w / 2;
  const ry = it.h / 2;
  if (it.style === 'thought') {
    const paths = [];
    const ang = Math.atan2((it.tailY - cy) / ry, (it.tailX - cx) / rx);
    const sx = cx + Math.cos(ang) * rx * 0.95;
    const sy = cy + Math.sin(ang) * ry * 0.95;
    const base = Math.min(rx, ry) * 0.2;
    [0.25, 0.58, 0.92].forEach((t, i) => {
      const r = Math.max(3, base * (1 - i * 0.3));
      const p = new Path2D();
      p.ellipse(sx + (it.tailX - sx) * t, sy + (it.tailY - sy) * t, r, r, 0, 0, Math.PI * 2);
      paths.push(p);
    });
    return paths;
  }
  const p = new Path2D();
  let b1;
  let b2;
  if (RECTISH.has(it.style)) {
    const half = it.style === 'chat' ? Math.min(it.w * 0.06, 12) : Math.min(it.w * 0.08, 18);
    [b1, b2] = rectTailBase(it, half);
  } else {
    const spread = it.style === 'shout' || it.style === 'scream' ? 0.16 : it.style === 'electric' ? 0.14 : 0.2;
    const ang = Math.atan2((it.tailY - cy) / ry, (it.tailX - cx) / rx);
    b1 = [cx + Math.cos(ang - spread) * rx * 0.85, cy + Math.sin(ang - spread) * ry * 0.85];
    b2 = [cx + Math.cos(ang + spread) * rx * 0.85, cy + Math.sin(ang + spread) * ry * 0.85];
  }
  p.moveTo(b1[0], b1[1]);
  if (it.style === 'electric') {
    // 번개 모양 꼬리
    const mx = (b1[0] + b2[0]) / 2;
    const my = (b1[1] + b2[1]) / 2;
    const vx = it.tailX - mx;
    const vy = it.tailY - my;
    const nx = -vy * 0.18;
    const ny = vx * 0.18;
    p.lineTo(mx + vx * 0.45 + nx, my + vy * 0.45 + ny);
    p.lineTo(mx + vx * 0.4 - nx * 0.2, my + vy * 0.4 - ny * 0.2);
    p.lineTo(it.tailX, it.tailY);
    p.lineTo(mx + vx * 0.55 - nx, my + vy * 0.55 - ny);
    p.lineTo(mx + vx * 0.6 + nx * 0.2, my + vy * 0.6 + ny * 0.2);
    p.lineTo(b2[0], b2[1]);
  } else if (it.style === 'shout' || it.style === 'scream' || it.style === 'system') {
    p.lineTo(it.tailX, it.tailY);
    p.lineTo(b2[0], b2[1]);
  } else if (it.style === 'chat') {
    // 메신저 말풍선: 짧게 휘어지는 꼬리
    p.quadraticCurveTo(it.tailX, b1[1] + (it.tailY - b1[1]) * 0.2, it.tailX, it.tailY);
    p.quadraticCurveTo((b2[0] + it.tailX) / 2, (b2[1] + it.tailY) / 2, b2[0], b2[1]);
  } else {
    p.quadraticCurveTo((b1[0] + it.tailX) / 2, (b1[1] + it.tailY) / 2, it.tailX, it.tailY);
    p.lineTo(b2[0], b2[1]);
  }
  p.closePath();
  return [p];
}

function drawBubble(ctx, it) {
  const body = bubbleBodyPath(ctx, it);
  const tails = bubbleTailPaths(it);
  const sw = it.strokeWidth || 0;
  ctx.lineJoin = 'round';

  if (it.style === 'flash') {
    // 플래시(독백 강조): 테두리 대신 바깥으로 뻗는 가는 선
    const rnd = mulberry32(hashStr(it.id) + 7);
    const cx = it.x + it.w / 2;
    const cy = it.y + it.h / 2;
    ctx.strokeStyle = it.stroke;
    ctx.lineCap = 'round';
    const n = 120;
    for (let i = 0; i < n; i += 1) {
      const a = (i / n) * Math.PI * 2 + rnd() * 0.03;
      const len = 0.18 + rnd() * 0.35;
      ctx.lineWidth = Math.max(0.6, sw * (0.25 + rnd() * 0.4));
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * it.w * 0.48, cy + Math.sin(a) * it.h * 0.48);
      ctx.lineTo(cx + Math.cos(a) * it.w * (0.5 + len), cy + Math.sin(a) * it.h * (0.5 + len));
      ctx.stroke();
    }
  }

  if (it.style === 'system') {
    // 게임 상태창: 반투명 패널 + 빛나는 테두리 + 모서리 브래킷
    ctx.save();
    ctx.shadowColor = it.stroke;
    ctx.shadowBlur = Math.max(6, sw * 4);
    ctx.fillStyle = it.fill || 'rgba(8,16,36,.86)';
    ctx.fill(body);
    tails.forEach((t) => ctx.fill(t));
    ctx.lineWidth = Math.max(1, sw * 0.6);
    ctx.strokeStyle = it.stroke;
    ctx.stroke(body);
    ctx.restore();
    const L = Math.min(it.w, it.h) * 0.16;
    ctx.strokeStyle = it.stroke;
    ctx.lineWidth = Math.max(2, sw * 1.2);
    ctx.lineCap = 'square';
    const o = -sw;
    [[it.x - o, it.y - o, 1, 1], [it.x + it.w + o, it.y - o, -1, 1], [it.x - o, it.y + it.h + o, 1, -1], [it.x + it.w + o, it.y + it.h + o, -1, -1]].forEach(([x, y, sx, sy]) => {
      ctx.beginPath(); ctx.moveTo(x + L * sx, y); ctx.lineTo(x, y); ctx.lineTo(x, y + L * sy); ctx.stroke();
    });
    if (it.title) {
      // 상단 제목 띠
      ctx.fillStyle = it.stroke;
      ctx.globalAlpha *= 0.85;
      const th = Math.max(it.fontSize * 1.3, 20);
      ctx.fillRect(it.x + it.w * 0.25, it.y - th / 2, it.w * 0.5, th);
      ctx.globalAlpha /= 0.85;
      ctx.fillStyle = '#04121f';
      ctx.font = `800 ${Math.round(it.fontSize * 0.8)}px ${it.font}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(it.title, it.x + it.w / 2, it.y);
    }
  } else {
    if (it.style === 'whisper') ctx.setLineDash([sw * 3, sw * 2.4]);
    const strokeOn = sw > 0 && it.style !== 'soft' && it.style !== 'flash';
    if (strokeOn) {
      // 외곽선 합성: 두 배 굵기로 먼저 그리고 채우기로 안쪽 절반을 덮어 하나의 실루엣처럼 보이게 함
      ctx.strokeStyle = it.stroke;
      ctx.lineWidth = it.style === 'double' ? sw * 2 + sw * 2.6 : sw * 2;
      ctx.stroke(body);
      tails.forEach((t) => ctx.stroke(t));
      if (it.style === 'double') {
        ctx.strokeStyle = it.fill || '#fff';
        ctx.lineWidth = sw * 2.6;
        ctx.stroke(body);
        ctx.strokeStyle = it.stroke;
        ctx.lineWidth = sw * 2;
        ctx.save();
        const cx = it.x + it.w / 2;
        const cy = it.y + it.h / 2;
        ctx.translate(cx, cy);
        ctx.scale(0.9, 0.9);
        ctx.translate(-cx, -cy);
        ctx.stroke(body);
        ctx.restore();
      }
    }
    ctx.setLineDash([]);
    ctx.fillStyle = it.fill || 'rgba(0,0,0,0)';
    ctx.fill(body, 'nonzero');
    tails.forEach((t) => ctx.fill(t));
    if (it.style === 'double' && strokeOn) {
      const cx = it.x + it.w / 2;
      const cy = it.y + it.h / 2;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(0.86, 0.86);
      ctx.translate(-cx, -cy);
      ctx.strokeStyle = it.stroke;
      ctx.lineWidth = Math.max(1, sw * 0.6);
      ctx.stroke(body);
      ctx.restore();
    }
  }

  // 텍스트 영역
  const padMap = { box: 0.86, narration: 0.86, rounded: 0.8, soft: 0.84, chat: 0.82, system: 0.86, drip: 0.8, shout: 0.62, scream: 0.56, heart: 0.6, electric: 0.7 };
  const pad = padMap[it.style] ?? 0.72;
  const iw = it.w * pad;
  const ih = it.h * (RECTISH.has(it.style) ? 0.84 : it.style === 'heart' ? 0.5 : 0.7);
  const oy = it.style === 'heart' ? -it.h * 0.06 : 0;
  drawTextBlock(ctx, it, it.x + (it.w - iw) / 2, it.y + (it.h - ih) / 2 + oy, iw, ih, it.align && it.style === 'system' ? it.align : 'center');
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
  if (it.shape === 'flashbg') {
    // 베타 플래시: 가운데를 비우고 사방으로 뻗는 가는 선 (순정만화·고백 장면)
    const rnd = mulberry32(hashStr(it.id));
    ctx.save();
    ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    if (it.fill) { ctx.fillStyle = it.fill; ctx.fillRect(x, y, w, h); }
    ctx.strokeStyle = it.stroke;
    ctx.lineCap = 'round';
    const R = Math.hypot(w, h) / 2;
    for (let i = 0; i < 260; i += 1) {
      const a = rnd() * Math.PI * 2;
      const r0 = R * (0.32 + rnd() * 0.25);
      ctx.lineWidth = Math.max(0.5, (it.strokeWidth || 1.5) * (0.3 + rnd()));
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * r0 * (w / Math.max(w, h)), cy + Math.sin(a) * r0 * (h / Math.max(w, h)));
      ctx.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R);
      ctx.stroke();
    }
    ctx.restore();
    return;
  }
  if (it.shape === 'gloom') {
    // 우울·충격: 위에서 내려오는 세로선
    const rnd = mulberry32(hashStr(it.id));
    ctx.save();
    ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    ctx.strokeStyle = it.stroke;
    const n = Math.max(6, Math.round(w / 9));
    for (let i = 0; i < n; i += 1) {
      const xx = x + (i + rnd() * 0.6) * (w / n);
      ctx.lineWidth = Math.max(0.6, (it.strokeWidth || 2) * (0.5 + rnd()));
      ctx.beginPath(); ctx.moveTo(xx, y); ctx.lineTo(xx, y + h * (0.45 + rnd() * 0.55)); ctx.stroke();
    }
    ctx.restore();
    return;
  }
  if (it.shape === 'blush') {
    // 홍조: 사선 빗금 묶음
    ctx.save();
    ctx.strokeStyle = it.stroke;
    ctx.lineCap = 'round';
    ctx.lineWidth = it.strokeWidth || 4;
    const n = 5;
    for (let i = 0; i < n; i += 1) {
      const xx = x + (w * (i + 0.5)) / n;
      ctx.beginPath(); ctx.moveTo(xx + w * 0.06, y + h * 0.15); ctx.lineTo(xx - w * 0.06, y + h * 0.85); ctx.stroke();
    }
    ctx.restore();
    return;
  }
  if (it.shape === 'anger') {
    // 분노 마크: 네 개의 꺾인 획
    ctx.save();
    ctx.strokeStyle = it.stroke;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = it.strokeWidth || 6;
    const g = Math.min(w, h) * 0.1;
    [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([sx, sy]) => {
      const ox = cx + sx * g;
      const oy = cy + sy * g;
      ctx.beginPath();
      ctx.moveTo(ox + sx * w * 0.36, oy);
      ctx.quadraticCurveTo(ox + sx * w * 0.06, oy + sy * h * 0.06, ox, oy + sy * h * 0.36);
      ctx.stroke();
    });
    ctx.restore();
    return;
  }
  if (it.shape === 'shine') {
    // 반짝반짝: 크기가 다른 별빛 셋
    [[0.35, 0.4, 0.34], [0.75, 0.25, 0.2], [0.7, 0.75, 0.16]].forEach(([fx, fy, fs]) => {
      const sp = new Path2D();
      sp.addPath(starPath(0, 0, 1, 0.16, 4), new DOMMatrix().translate(x + w * fx, y + h * fy).scale(w * fs, h * fs));
      if (it.fill) { ctx.fillStyle = it.fill; ctx.fill(sp); }
      if (it.strokeWidth > 0) { ctx.lineJoin = 'round'; ctx.lineWidth = it.strokeWidth; ctx.strokeStyle = it.stroke; ctx.stroke(sp); }
    });
    return;
  }
  if (it.shape === 'phone') {
    // 스마트폰 화면 프레임 (메신저 장면용)
    const r = Math.min(w, h) * 0.09;
    const bw = it.strokeWidth || 10;
    const outer = new Path2D();
    rrPath(outer, x, y, w, h, r);
    ctx.fillStyle = it.stroke;
    ctx.fill(outer);
    const inner = new Path2D();
    rrPath(inner, x + bw, y + bw * 2.4, w - bw * 2, h - bw * 4.6, Math.max(2, r - bw));
    ctx.fillStyle = it.fill || '#f3f5fb';
    ctx.fill(inner);
    ctx.fillStyle = '#2a2b36';
    const nw = w * 0.26;
    const notch = new Path2D();
    rrPath(notch, cx - nw / 2, y + bw * 0.7, nw, bw * 1.1, bw * 0.55);
    ctx.fill(notch);
    ctx.fillStyle = '#5a5c70';
    const bar = new Path2D();
    rrPath(bar, cx - w * 0.15, y + h - bw * 1.5, w * 0.3, bw * 0.5, bw * 0.25);
    ctx.fill(bar);
    return;
  }
  if (it.shape === 'lightning') {
    p.moveTo(x + w * 0.55, y);
    p.lineTo(x + w * 0.18, y + h * 0.55);
    p.lineTo(x + w * 0.46, y + h * 0.55);
    p.lineTo(x + w * 0.3, y + h);
    p.lineTo(x + w * 0.85, y + h * 0.4);
    p.lineTo(x + w * 0.56, y + h * 0.4);
    p.lineTo(x + w * 0.8, y);
    p.closePath();
  } else if (it.shape === 'sweat') {
    p.moveTo(cx, y);
    p.bezierCurveTo(cx + w * 0.1, y + h * 0.3, x + w, y + h * 0.5, x + w, y + h * 0.68);
    p.arc(cx, y + h * 0.68, w / 2, 0, Math.PI, false);
    p.bezierCurveTo(x, y + h * 0.5, cx - w * 0.1, y + h * 0.3, cx, y);
    p.closePath();
  } else if (it.shape === 'note') {
    const r = Math.min(w, h) * 0.2;
    p.ellipse(x + w * 0.3, y + h - r, r * 1.2, r, -0.4, 0, Math.PI * 2);
    p.ellipse(x + w * 0.78, y + h * 0.82 - r, r * 1.2, r, -0.4, 0, Math.PI * 2);
    p.rect(x + w * 0.3 + r * 1.05, y + h * 0.12, Math.max(2, w * 0.05), h * 0.78 - r);
    p.rect(x + w * 0.78 + r * 1.05, y, Math.max(2, w * 0.05), h * 0.72 - r);
    p.moveTo(x + w * 0.3 + r * 1.05, y + h * 0.12);
    p.lineTo(x + w * 0.78 + r * 1.05 + w * 0.05, y);
    p.lineTo(x + w * 0.78 + r * 1.05 + w * 0.05, y + h * 0.14);
    p.lineTo(x + w * 0.3 + r * 1.05, y + h * 0.26);
    p.closePath();
  } else
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
