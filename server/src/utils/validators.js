import { z } from 'zod';

/** 제어문자 제거 + 앞뒤 공백 제거. HTML 은 저장 시 그대로 두되 출력은 항상 이스케이프(React)한다. */
export function cleanText(s) {
  // eslint-disable-next-line no-control-regex
  return String(s ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim();
}

export const text = (min, max, label) =>
  z
    .string({ error: `${label}을(를) 입력해 주세요.` })
    .transform(cleanText)
    .refine((v) => v.length >= min, { message: min > 0 ? `${label}을(를) ${min}자 이상 입력해 주세요.` : `${label} 오류` })
    .refine((v) => v.length <= max, { message: `${label}은(는) ${max}자 이하로 입력해 주세요.` });

export const USERNAME_RE = /^[a-z0-9_]{4,20}$/;
export const EMAIL_RE = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[a-z]{2,}$/i;
// 한국 휴대폰/일반 전화: 숫자 9~11자리 (하이픈 허용 후 제거)
export const PHONE_RE = /^0\d{8,10}$/;

export const usernameField = z
  .string({ error: '아이디를 입력해 주세요.' })
  .transform((v) => v.trim().toLowerCase())
  .refine((v) => v.length > 0, { message: '아이디를 입력해 주세요.' })
  .refine((v) => USERNAME_RE.test(v), { message: '아이디는 영문 소문자·숫자·밑줄(_) 4~20자로 입력해 주세요.' });

export const passwordField = z
  .string({ error: '비밀번호를 입력해 주세요.' })
  .refine((v) => v.length >= 8 && v.length <= 64, { message: '비밀번호는 8~64자로 입력해 주세요.' })
  .refine((v) => /[A-Za-z]/.test(v) && /\d/.test(v), { message: '비밀번호에는 영문자와 숫자가 모두 포함되어야 합니다.' })
  .refine((v) => !/\s/.test(v), { message: '비밀번호에 공백을 사용할 수 없습니다.' });

export const nicknameField = z
  .string({ error: '닉네임을 입력해 주세요.' })
  .transform(cleanText)
  .refine((v) => v.length >= 2 && v.length <= 16, { message: '닉네임은 2~16자로 입력해 주세요.' })
  .refine((v) => /^[\p{L}\p{N}_ .-]+$/u.test(v), { message: '닉네임에는 한글·영문·숫자·공백·_ . - 만 사용할 수 있습니다.' });

export const optionalEmail = z
  .string()
  .nullish()
  .transform((v) => (v == null ? '' : String(v).trim().toLowerCase()))
  .refine((v) => v === '' || (v.length <= 120 && EMAIL_RE.test(v)), { message: '이메일 형식이 올바르지 않습니다.' });

export const optionalPhone = z
  .string()
  .nullish()
  .transform((v) => (v == null ? '' : String(v).replace(/[\s-]/g, '')))
  .refine((v) => v === '' || PHONE_RE.test(v), { message: '전화번호 형식이 올바르지 않습니다. (예: 010-1234-5678)' });

export function normalizePhone(v) {
  return String(v || '').replace(/[\s-]/g, '');
}

export function isHttpUrl(v) {
  if (!v) return true;
  try {
    const u = new URL(v, 'http://localhost');
    return ['http:', 'https:'].includes(u.protocol) || v.startsWith('/uploads/');
  } catch {
    return false;
  }
}

/** 업로드 API 로 받은 이미지 URL 만 허용 (임의 외부 URL / javascript: 차단) */
export const imageUrlField = z
  .string()
  .max(500)
  .refine((v) => v === '' || v.startsWith('/uploads/') || /^https:\/\/res\.cloudinary\.com\//.test(v), {
    message: '이미지는 업로드 기능을 통해 등록해 주세요.',
  });

/** #rrggbb 색상 (빈 문자열 = 기본값) */
export const HEX_COLOR_RE = /^#[0-9a-f]{6}$/i;
export const hexColorField = z
  .string()
  .transform((v) => v.trim().toLowerCase())
  .refine((v) => v === '' || HEX_COLOR_RE.test(v), { message: '색상은 #rrggbb 형식으로 입력해 주세요.' });
