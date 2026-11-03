/**
 * 웹웹 로고 — 겹친 두 개의 말풍선(두 컷, 두 목소리 = "웹·웹") 안에
 * 붓으로 그은 이중 W 획. 세로 스크롤 웹툰의 컷 흐름과 창작(펜 획)을 함께 상징한다.
 */
export function LogoMark({ size = 36, title = '웹웹' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" role="img" aria-label={title}>
      <path d="M17 11h40a6 6 0 0 1 6 6v26a6 6 0 0 1-6 6H33l-12 10 2-10h-6a6 6 0 0 1-6-6V17a6 6 0 0 1 6-6z" fill="var(--marker)" />
      <path d="M10 6h40a6 6 0 0 1 6 6v26a6 6 0 0 1-6 6H26l-12 10 2-10h-6a6 6 0 0 1-6-6V12a6 6 0 0 1 6-6z" fill="var(--cobalt)" stroke="var(--ink)" strokeWidth="3" strokeLinejoin="round" />
      <path d="M15 17l5 15 5-11 5 11 5-11 5 11 5-15" fill="none" stroke="#fff" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function Logo({ size = 34, compact = false }) {
  return (
    <span className="logo">
      <LogoMark size={size} />
      {!compact && (
        <span className="logo-type">
          <span className="logo-ko">웹웹</span>
          <span className="logo-en">WEBWEB</span>
        </span>
      )}
    </span>
  );
}
