// 백엔드 API 호출 래퍼 — 쿠키 기반 인증 + CSRF 토큰 자동 첨부
function readCookie(name) {
  const m = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return m ? decodeURIComponent(m[1]) : '';
}

export class ApiError extends Error {
  constructor(status, message, code, data) {
    super(message);
    this.status = status;
    this.code = code;
    this.data = data;
  }
}

let csrfReady = null;
async function ensureCsrf() {
  if (readCookie('ww_csrf')) return;
  if (!csrfReady) csrfReady = fetch('/api/auth/me', { credentials: 'same-origin' }).finally(() => { csrfReady = null; });
  await csrfReady;
}

export async function request(method, url, body, { form, signal } = {}) {
  const headers = {};
  const write = !['GET', 'HEAD'].includes(method);
  if (write) {
    await ensureCsrf();
    headers['X-CSRF-Token'] = readCookie('ww_csrf');
  }
  let payload;
  if (form) payload = form;
  else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  let res;
  try {
    res = await fetch(`/api${url}`, { method, headers, body: payload, credentials: 'same-origin', signal });
  } catch (e) {
    if (e.name === 'AbortError') throw e;
    throw new ApiError(0, '네트워크에 연결할 수 없습니다. 인터넷 연결을 확인해 주세요.', 'NETWORK');
  }
  let data = null;
  const text = await res.text();
  try { data = text ? JSON.parse(text) : null; } catch { data = { error: text }; }
  if (!res.ok) {
    // CSRF 토큰 만료 시 1회 재시도
    if (res.status === 403 && data?.code === 'CSRF' && !request._retried) {
      document.cookie = 'ww_csrf=; Max-Age=0; path=/';
      request._retried = true;
      try { return await request(method, url, body, { form, signal }); } finally { request._retried = false; }
    }
    throw new ApiError(res.status, data?.error || `요청에 실패했습니다. (${res.status})`, data?.code, data);
  }
  return data;
}

export const api = {
  get: (u, o) => request('GET', u, undefined, o),
  post: (u, b, o) => request('POST', u, b ?? {}, o),
  patch: (u, b) => request('PATCH', u, b ?? {}),
  put: (u, b) => request('PUT', u, b ?? {}),
  del: (u) => request('DELETE', u),
  upload(u, fileOrBlob, filename = 'image.png') {
    const fd = new FormData();
    fd.append('image', fileOrBlob, fileOrBlob.name || filename);
    return request('POST', u, undefined, { form: fd });
  },
};

export function qs(params) {
  const s = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') s.set(k, v);
  });
  const str = s.toString();
  return str ? `?${str}` : '';
}
