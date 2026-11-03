const KST = 'Asia/Seoul';

export function fmtNum(n) {
  const v = Number(n) || 0;
  if (v >= 100000000) return `${(v / 100000000).toFixed(1).replace(/\.0$/, '')}억`;
  if (v >= 10000) return `${(v / 10000).toFixed(1).replace(/\.0$/, '')}만`;
  if (v >= 1000) return v.toLocaleString('ko-KR');
  return String(v);
}

export function fmtDate(d, withTime = false) {
  if (!d) return '';
  const opts = { timeZone: KST, year: 'numeric', month: '2-digit', day: '2-digit' };
  if (withTime) Object.assign(opts, { hour: '2-digit', minute: '2-digit', hour12: false });
  return new Intl.DateTimeFormat('ko-KR', opts).format(new Date(d));
}

export function fmtRelative(d) {
  if (!d) return '';
  const diff = (Date.now() - new Date(d).getTime()) / 1000;
  if (diff < 60) return '방금 전';
  if (diff < 3600) return `${Math.floor(diff / 60)}분 전`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}일 전`;
  return fmtDate(d);
}

/** 지금부터 n분 뒤의 KST 시각을 datetime-local 입력값(YYYY-MM-DDTHH:mm) 형식으로 */
export function kstInputValue(minutesFromNow = 60) {
  const t = new Date(Date.now() + minutesFromNow * 60000 + 9 * 3600000);
  return t.toISOString().slice(0, 16);
}

export function untilText(d) {
  const ms = new Date(d).getTime() - Date.now();
  if (ms <= 0) return '곧 공개';
  const m = Math.floor(ms / 60000);
  if (m < 60) return `${m}분 후 공개`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}시간 후 공개`;
  return `${Math.floor(h / 24)}일 후 공개`;
}

/** '3화 3화' 처럼 제목이 회차 번호와 같으면 한 번만 표시 */
export function epLabel(ep) {
  if (!ep) return '';
  const t = (ep.title || '').trim();
  return t === `${ep.number}화` ? t : `${ep.number}화 ${t}`;
}

export const GENRES = ['판타지', '액션', '일상', '로맨스', '코미디', '공포', '미스터리', '드라마', 'SF', '기타'];
