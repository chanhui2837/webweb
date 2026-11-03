// 서버는 모든 시간을 UTC(Date)로 저장하고, "하루" 단위 계산은 한국 시간(KST, UTC+9) 기준으로 한다.
// 한국은 서머타임이 없으므로 고정 오프셋 +09:00 을 사용한다.
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** 주어진 시각의 KST 날짜 문자열 (YYYY-MM-DD) */
export function kstDay(date = new Date()) {
  return new Date(date.getTime() + KST_OFFSET_MS).toISOString().slice(0, 10);
}

/** KST 기준 n일 전/후 날짜 문자열 */
export function kstDayOffset(days, from = new Date()) {
  return kstDay(new Date(from.getTime() + days * 86400000));
}

/**
 * "YYYY-MM-DDTHH:mm" 형식의 KST 로컬 시각 문자열을 UTC Date 로 변환.
 * 이미 오프셋/Z 가 붙은 ISO 문자열도 허용한다.
 */
export function parseKstDateTime(input) {
  if (typeof input !== 'string') return null;
  const s = input.trim();
  let d;
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(s)) {
    d = new Date(`${s.length === 16 ? `${s}:00` : s}+09:00`);
  } else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/.test(s)) {
    d = new Date(s);
  } else {
    return null;
  }
  return Number.isNaN(d.getTime()) ? null : d;
}

/** UTC Date → "YYYY-MM-DD HH:mm" (KST) */
export function formatKst(date) {
  if (!date) return '';
  const k = new Date(new Date(date).getTime() + KST_OFFSET_MS).toISOString();
  return `${k.slice(0, 10)} ${k.slice(11, 16)}`;
}
