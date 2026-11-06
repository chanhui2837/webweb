import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { fmtNum, fmtRelative, untilText } from '../lib/format.js';

export function Avatar({ user, size = 36 }) {
  const name = user?.nickname || '?';
  if (user?.avatarUrl) {
    return <img className="avatar" src={user.avatarUrl} alt="" width={size} height={size} style={{ width: size, height: size }} />;
  }
  return (
    <span className="avatar avatar-fallback" style={{ width: size, height: size, fontSize: size * 0.42 }} aria-hidden="true">
      {name.slice(0, 1)}
    </span>
  );
}

export function AuthorLink({ author }) {
  if (!author) return null;
  return <Link className="author-link" to={`/u/${author.username}`}>{author.nickname}</Link>;
}

export function Icon({ name, size = 18 }) {
  const p = {
    heart: 'M12 20.5s-7.5-4.6-9.3-9.2C1.4 8 3.3 4.5 6.8 4.5c2.1 0 3.5 1.1 5.2 3 1.7-1.9 3.1-3 5.2-3 3.5 0 5.4 3.5 4.1 6.8-1.8 4.6-9.3 9.2-9.3 9.2z',
    eye: 'M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
    star: 'M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.8z',
    bookmark: 'M6 3.5h12v17l-6-4-6 4z',
    chat: 'M4 5h16v11H9l-5 4z',
    lock: 'M7 10V7a5 5 0 0 1 10 0v3M5 10h14v10H5z',
    bell: 'M6 16V11a6 6 0 0 1 12 0v5l2 2H4zM10 20a2 2 0 0 0 4 0',
    search: 'M10.5 17a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13zM15.5 15.5 21 21',
    plus: 'M12 5v14M5 12h14',
    cookie: 'M12 3a9 9 0 1 0 9 9 3 3 0 0 1-3-3 3 3 0 0 1-3-3 3 3 0 0 1-3-3zM8.5 11.5h.01M12 16h.01M15.5 13h.01M9 15.5h.01',
    home: 'M3 11l9-7 9 7v9h-6v-6H9v6H3z',
    book: 'M4 5c3-1.5 5.5-1.5 8 0v15c-2.5-1.5-5-1.5-8 0zM12 5c2.5-1.5 5-1.5 8 0v15c-3-1.5-5.5-1.5-8 0z',
    brush: 'M14 4l6 6-8.5 8.5a3 3 0 0 1-2 .9L5 20l.6-4.5a3 3 0 0 1 .9-2zM12 6l6 6',
    image: 'M4 5h16v14H4zM4 16l5-5 4 4 3-3 4 4M15.5 9.5h.01',
    user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 20c1.5-4 4.5-6 8-6s6.5 2 8 6',
    shield: 'M12 3l8 3v6c0 4.5-3.3 8-8 9-4.7-1-8-4.5-8-9V6z',
    inbox: 'M3 13l3-8h12l3 8v6H3zM3 13h5l1.5 2.5h5L16 13h5',
    menu: 'M4 7h16M4 12h16M4 17h16',
    x: 'M6 6l12 12M18 6 6 18',
    chevronL: 'M15 5l-7 7 7 7',
    chevronR: 'M9 5l7 7-7 7',
    trash: 'M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13',
    edit: 'M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4',
    clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2',
    flag: 'M5 21V4M5 4h11l-2 4 2 4H5',
    logout: 'M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10',
    up: 'M12 19V5M6 11l6-6 6 6',
    down: 'M12 5v14M6 13l6 6 6-6',
    copy: 'M8 8h12v12H8zM4 16V4h12',
  }[name];
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={p} />
    </svg>
  );
}

/** 표지를 자르지 않고 전부 보여 준다. 비율이 다른 빈 공간은 같은 그림을 흐리게 깔아 채움 */
export function CoverImage({ src, alt = '', fallback }) {
  if (!src) return <div className="thumb-empty">{fallback}</div>;
  return (
    <span className="cover-img">
      <img className="cover-img-bg" src={src} alt="" aria-hidden="true" loading="lazy" />
      <img className="cover-img-fg" src={src} alt={alt} loading="lazy" />
    </span>
  );
}

/* ---------------- 작품 배너 (썸네일) ----------------
 * 네이버 웹툰 작품 홈처럼, 단색 배경 띠 위에 썸네일 그림이 떠 있고 왼쪽에 제목·작가가 놓인다.
 * 썸네일이 투명 PNG(캐릭터만 있는 그림)면 배경색 위에 그대로 떠 보인다.
 */
export const DEFAULT_BANNER_COLOR = '#dfe5ff';
export const BANNER_COLORS = ['#ffa8a8', '#ffd0a6', '#ffe58f', '#c5ecb0', '#a8e6dc', '#a9d4ff', '#c9b8ff', '#f5b8e0', '#e9e4d8', '#2b2d42'];

/** 배경이 어두우면 흰 글씨 */
export function isDarkColor(hex) {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex || '');
  if (!m) return false;
  const [r, g, b] = m.slice(1).map((x) => parseInt(x, 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 0.36;
}

export function WebtoonBanner({ w, imageUrl, color, tagline, children, preview = false }) {
  const bg = color || w.bannerColor || DEFAULT_BANNER_COLOR;
  const src = imageUrl !== undefined ? imageUrl : w.thumbnailUrl;
  const dark = isDarkColor(bg);
  return (
    <div className={`wt-banner ${dark ? 'dark' : ''} ${preview ? 'preview' : ''}`} style={{ '--banner-bg': bg }}>
      <div className="wt-banner-inner">
        <div className="wt-banner-text">
          {tagline && <p className="wt-banner-tagline">{tagline}</p>}
          {preview
            ? <p className="wt-banner-title">{w.title || '작품 제목'}</p>
            : <h1 className="wt-banner-title">{w.title || '작품 제목'}</h1>}
          {children}
        </div>
        <div className="wt-banner-art">
          {src ? <img src={src} alt={preview ? '' : `${w.title} 썸네일`} /> : <span className="wt-banner-empty">{(w.title || '웹웹').slice(0, 2)}</span>}
        </div>
      </div>
    </div>
  );
}

/** 썸네일 가장자리 색을 뽑아 배너 배경색 후보로 (사각형 그림도 배경과 자연스럽게 이어지게) */
export function sampleEdgeColor(src) {
  return new Promise((resolve) => {
    const im = new Image();
    if (!src.startsWith('blob:') && !src.startsWith('data:')) im.crossOrigin = 'anonymous';
    im.onload = () => {
      try {
        const W = 64;
        const H = Math.max(1, Math.round((im.naturalHeight / im.naturalWidth) * W));
        const c = document.createElement('canvas');
        c.width = W; c.height = H;
        const ctx = c.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(im, 0, 0, W, H);
        const { data } = ctx.getImageData(0, 0, W, H);
        let r = 0; let g = 0; let b = 0; let n = 0;
        const take = (x, y) => {
          const i = (y * W + x) * 4;
          if (data[i + 3] < 200) return; // 투명한 곳은 건너뜀
          r += data[i]; g += data[i + 1]; b += data[i + 2]; n += 1;
        };
        for (let y = 0; y < H; y += 1) { take(0, y); take(1, y); take(W - 1, y); take(W - 2, y); }
        for (let x = 0; x < W; x += 1) take(x, 0);
        if (!n) { resolve(''); return; }
        const hex = (v) => Math.round(v / n).toString(16).padStart(2, '0');
        resolve(`#${hex(r)}${hex(g)}${hex(b)}`);
      } catch { resolve(''); }
    };
    im.onerror = () => resolve('');
    im.src = src;
  });
}

export function WebtoonCard({ w, showStatus = false, to }) {
  return (
    <Link to={to || `/webtoons/${w.id}`} className="wcard">
      <div className="wcard-thumb cover">
        <CoverImage src={w.coverUrl || w.thumbnailUrl} fallback={w.title.slice(0, 2)} />
        <span className="genre-chip">{w.genre}</span>
        {showStatus && (
          <span className={`status-chip ${w.visibility === 'public' ? 'on' : ''}`}>
            {w.hidden ? '숨김됨' : w.visibility === 'public' ? '공개' : '비공개'}
          </span>
        )}
      </div>
      <div className="wcard-body">
        <strong className="wcard-title">{w.title}</strong>
        <span className="wcard-author">{w.author?.nickname}</span>
        <span className="wcard-stats">
          <span><Icon name="eye" size={13} /> {fmtNum(w.viewCount)}</span>
          <span><Icon name="heart" size={13} /> {fmtNum(w.likeCount)}</span>
          {w.publishedEpisodeCount > 0 && <span>{w.publishedEpisodeCount}화</span>}
        </span>
      </div>
    </Link>
  );
}

export function IllustCard({ i, to }) {
  return (
    <Link to={to || `/illustrations/${i.id}`} className="icard">
      <div className="icard-img" style={i.width && i.height ? { aspectRatio: `${i.width} / ${i.height}` } : undefined}>
        {i.imageUrl ? <img src={i.imageUrl} alt={i.title} loading="lazy" /> : <div className="thumb-empty">{i.title.slice(0, 2)}</div>}
      </div>
      <div className="icard-meta">
        <strong>{i.title}</strong>
        <span className="icard-row">
          <span>{i.author?.nickname}</span>
          <span className="icard-like"><Icon name="heart" size={12} /> {fmtNum(i.likeCount)}</span>
        </span>
      </div>
    </Link>
  );
}

export function EpisodeStatus({ ep }) {
  if (ep.status === 'published') return <span className="ep-badge pub">공개</span>;
  if (ep.status === 'scheduled') return <span className="ep-badge sch" title={ep.publishAt}><Icon name="clock" size={12} /> {untilText(ep.publishAt)}</span>;
  return <span className="ep-badge draft">임시저장</span>;
}

export function Empty({ title, children, action }) {
  return (
    <div className="empty">
      <div className="empty-bubble" aria-hidden="true">…</div>
      <p className="empty-title">{title}</p>
      {children && <p className="empty-desc">{children}</p>}
      {action}
    </div>
  );
}

export function Spinner({ label = '불러오는 중' }) {
  return <div className="spinner" role="status"><span className="spinner-dot" /><span className="sr-only">{label}</span></div>;
}

export function Pager({ page, pages, onPage }) {
  if (!pages || pages <= 1) return null;
  const nums = [];
  const start = Math.max(1, page - 2);
  const end = Math.min(pages, start + 4);
  for (let n = start; n <= end; n += 1) nums.push(n);
  return (
    <nav className="pager" aria-label="페이지">
      <button type="button" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="이전 페이지"><Icon name="chevronL" size={16} /></button>
      {nums.map((n) => (
        <button type="button" key={n} className={n === page ? 'on' : ''} onClick={() => onPage(n)} aria-current={n === page ? 'page' : undefined}>{n}</button>
      ))}
      <button type="button" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="다음 페이지"><Icon name="chevronR" size={16} /></button>
    </nav>
  );
}

export function Modal({ open, title, onClose, children, footer, wide = false }) {
  const ref = useRef(null);
  // onClose 는 부모가 렌더링될 때마다 새 함수가 되므로 ref 에 담아 둔다.
  // (effect 의존성에 넣으면 글자를 입력할 때마다 effect 가 다시 실행되어 포커스가 닫기 버튼으로 튀는 버그가 생김)
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onCloseRef.current?.(); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    // 모달이 열릴 때 한 번만, 본문의 입력칸을 먼저 포커스 (없으면 대화상자 자체)
    const t = setTimeout(() => {
      const el = ref.current;
      if (!el || el.contains(document.activeElement)) return;
      const field = el.querySelector('.modal-body input:not([type=hidden]):not([type=radio]):not([type=checkbox]), .modal-body textarea, .modal-body select');
      (field || el).focus();
    }, 30);
    return () => { clearTimeout(t); document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [open]);
  if (!open) return null;
  return (
    <div className="modal-back" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
      <div className={`modal ${wide ? 'modal-wide' : ''}`} role="dialog" aria-modal="true" aria-label={title} ref={ref} tabIndex={-1}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="닫기"><Icon name="x" /></button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

export function Section({ title, more, children }) {
  return (
    <section className="section">
      <div className="section-head">
        <h2>{title}</h2>
        {more && <Link to={more} className="section-more">더 보기</Link>}
      </div>
      {children}
    </section>
  );
}

export function Field({ label, hint, error, children, htmlFor }) {
  return (
    <div className={`field ${error ? 'has-error' : ''}`}>
      {label && <label htmlFor={htmlFor}>{label}</label>}
      {children}
      {error ? <p className="field-error">{error}</p> : hint ? <p className="field-hint">{hint}</p> : null}
    </div>
  );
}

export function TimeAgo({ date }) {
  return <time dateTime={date} title={new Date(date).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}>{fmtRelative(date)}</time>;
}
