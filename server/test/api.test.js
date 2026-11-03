// 실제 MongoDB 에 연결해 HTTP API 전체 흐름을 검증하는 통합 테스트
// 실행: MONGODB_URI_TEST=mongodb://127.0.0.1:27017/webweb_test npm test
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

process.env.NODE_ENV = 'test';
process.env.ADMIN_USERNAME = 'chanhui2837';
process.env.ADMIN_INITIAL_PASSWORD = 'AdminPass123';
process.env.MONGODB_URI = process.env.MONGODB_URI_TEST || 'mongodb://127.0.0.1:27017/webweb_test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PNG = fs.readFileSync(path.join(__dirname, 'tiny.png'));

const mongoose = (await import('mongoose')).default;
const { connectDB } = await import('../src/config/db.js');
const { createApp } = await import('../src/app.js');
const { bootstrapAdmin } = await import('../src/services/adminBootstrap.js');
const { processDueSchedules } = await import('../src/services/episodeService.js');
const models = await import('../src/models/index.js');

let server;
let base;

class Client {
  constructor() { this.jar = {}; }
  cookieHeader() { return Object.entries(this.jar).map(([k, v]) => `${k}=${v}`).join('; '); }
  store(res) {
    for (const c of res.headers.getSetCookie()) {
      const [kv] = c.split(';');
      const i = kv.indexOf('=');
      const k = kv.slice(0, i);
      const v = kv.slice(i + 1);
      if (v === '' || /Expires=Thu, 01 Jan 1970/i.test(c)) delete this.jar[k]; else this.jar[k] = v;
    }
  }
  async req(method, url, body, { form } = {}) {
    if (!this.jar.ww_csrf) await this.raw('GET', '/api/auth/me');
    return this.raw(method, url, body, { form });
  }
  async raw(method, url, body, { form } = {}) {
    const headers = { cookie: this.cookieHeader() };
    if (this.jar.ww_csrf) headers['x-csrf-token'] = this.jar.ww_csrf;
    let payload;
    if (form) payload = form;
    else if (body !== undefined) { headers['content-type'] = 'application/json'; payload = JSON.stringify(body); }
    const res = await fetch(base + url, { method, headers, body: payload });
    this.store(res);
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { json = text; }
    return { status: res.status, body: json };
  }
  get(u) { return this.req('GET', u); }
  post(u, b) { return this.req('POST', u, b ?? {}); }
  patch(u, b) { return this.req('PATCH', u, b ?? {}); }
  put(u, b) { return this.req('PUT', u, b ?? {}); }
  del(u) { return this.req('DELETE', u); }
  upload(u) {
    const fd = new FormData();
    fd.append('image', new Blob([PNG], { type: 'image/png' }), 'a.png');
    return this.req('POST', u, undefined, { form: fd });
  }
}

before(async () => {
  await connectDB();
  await mongoose.connection.db.dropDatabase();
  await Promise.all(Object.values(mongoose.models).map((m) => m.syncIndexes()));
  await bootstrapAdmin();
  const app = createApp();
  await new Promise((r) => { server = app.listen(0, r); });
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  server?.close();
  await mongoose.disconnect();
});

const alice = new Client(); // 작가
const bob = new Client(); // 독자
const admin = new Client();
const ctx = {};

test('CSRF 토큰 없는 변경 요청은 거부된다', async () => {
  const res = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  assert.equal(res.status, 403);
});

test('회원가입 검증 + 쿠키 10개 지급', async () => {
  let r = await alice.post('/api/auth/register', { username: 'ab', password: 'x', nickname: 'a' });
  assert.equal(r.status, 400);
  r = await alice.post('/api/auth/register', { username: 'alice01', password: 'onlyletters', nickname: '앨리스' });
  assert.equal(r.status, 400, '숫자 없는 비밀번호 거부');
  r = await alice.post('/api/auth/register', { username: 'alice01', password: 'Pass1234', nickname: '앨리스', email: 'bad-email' });
  assert.equal(r.status, 400, '이메일 형식');
  r = await alice.post('/api/auth/register', { username: 'alice01', password: 'Pass1234', nickname: '앨리스', phone: '12345' });
  assert.equal(r.status, 400, '전화번호 형식');
  r = await alice.post('/api/auth/register', { username: 'chanhui2837', password: 'Pass1234', nickname: '가짜관리자' });
  assert.equal(r.status, 400, '관리자 아이디 선점 불가');
  r = await alice.post('/api/auth/register', { username: 'alice01', password: 'Pass1234', nickname: '앨리스', email: 'alice@example.com', phone: '010-1111-2222' });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(r.body.wallet.balance, 10);
  assert.equal(r.body.user.isAdmin, false);
  r = await bob.post('/api/auth/register', { username: 'alice01', password: 'Pass1234', nickname: '밥돌이' });
  assert.equal(r.status, 409, '중복 아이디');
  r = await bob.post('/api/auth/register', { username: 'bob0001', password: 'Pass1234', nickname: '앨 리스' });
  assert.equal(r.status, 409, '닉네임 중복(공백 무시)');
  r = await bob.post('/api/auth/register', { username: 'bob0001', password: 'Pass1234', nickname: '밥돌이' });
  assert.equal(r.status, 201);
  const tx = await models.CookieTransaction.find({ type: 'signup' });
  assert.equal(tx.length, 2);
});

test('로그인/로그아웃/잠금', async () => {
  const c = new Client();
  let r = await c.post('/api/auth/login', { username: 'bob0001', password: 'wrong1234' });
  assert.equal(r.status, 401);
  r = await c.post('/api/auth/login', { username: 'BOB0001', password: 'Pass1234' });
  assert.equal(r.status, 200);
  r = await c.get('/api/auth/me');
  assert.equal(r.body.user.username, 'bob0001');
  await c.post('/api/auth/logout');
  r = await c.get('/api/auth/me');
  assert.equal(r.body.user, null);
  // 5회 실패 → 잠금
  const t = new Client();
  for (let i = 0; i < 5; i += 1) await t.post('/api/auth/login', { username: 'alice01', password: 'nope0000' });
  r = await t.post('/api/auth/login', { username: 'alice01', password: 'Pass1234' });
  assert.equal(r.status, 423);
  await models.User.updateOne({ username: 'alice01' }, { $set: { lockUntil: null } });
});

test('관리자: 서버 부트스트랩 계정만 관리자, 일반 사용자는 관리자 API 거부', async () => {
  let r = await bob.get('/api/admin/stats');
  assert.equal(r.status, 403);
  r = await admin.post('/api/auth/login', { username: 'chanhui2837', password: 'AdminPass123' });
  assert.equal(r.status, 200);
  assert.equal(r.body.user.isAdmin, true);
  assert.equal(r.body.wallet.unlimited, true);
  r = await admin.get('/api/admin/stats');
  assert.equal(r.status, 200);
  assert.equal(r.body.users, 3);
});

test('아이디 찾기 / 비밀번호 재설정 (인증번호)', async () => {
  const c = new Client();
  const origLog = console.log;
  const codes = [];
  console.log = (...a) => { const m = String(a.join(' ')).match(/code=(\d{6})/); if (m) codes.push(m[1]); else origLog(...a); };
  try {
    let r = await c.post('/api/auth/find-id/request', { channel: 'email', target: 'alice@example.com' });
    assert.equal(r.status, 200);
    const reqId = r.body.requestId;
    r = await c.post('/api/auth/find-id/verify', { requestId: reqId, code: '000000' === codes[0] ? '111111' : '000000' });
    assert.equal(r.status, 400);
    r = await c.post('/api/auth/find-id/verify', { requestId: reqId, code: codes[0] });
    assert.equal(r.body.username, 'alice01');
    // 미등록 이메일도 같은 응답 (계정 존재 노출 X)
    r = await c.post('/api/auth/find-id/request', { channel: 'email', target: 'nobody@example.com' });
    assert.equal(r.status, 200);
    // 비밀번호 재설정
    r = await c.post('/api/auth/reset/request', { username: 'alice01', channel: 'phone', target: '01011112222' });
    assert.equal(r.status, 200);
    const rid = r.body.requestId;
    r = await c.post('/api/auth/reset/verify', { requestId: rid, code: codes[1] });
    assert.equal(r.status, 200);
    r = await c.post('/api/auth/reset/complete', { requestId: rid, resetToken: r.body.resetToken, newPassword: 'NewPass5678' });
    assert.equal(r.status, 200);
    r = await c.post('/api/auth/login', { username: 'alice01', password: 'NewPass5678' });
    assert.equal(r.status, 200);
    // 이전 세션은 무효화
    r = await alice.get('/api/users/me/works');
    assert.equal(r.status, 401);
    r = await alice.post('/api/auth/login', { username: 'alice01', password: 'NewPass5678' });
    assert.equal(r.status, 200);
  } finally {
    console.log = origLog;
  }
});

test('프로필: 사진 업로드, 닉네임/자기소개 수정, 이메일 변경은 비밀번호 필요', async () => {
  let r = await alice.upload('/api/users/me/avatar');
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.match(r.body.user.avatarUrl, /^\/uploads\/avatars\//);
  r = await alice.patch('/api/users/me', { bio: '안녕하세요 앨리스입니다', nickname: '앨리스작가' });
  assert.equal(r.status, 200);
  assert.equal(r.body.user.nickname, '앨리스작가');
  assert.equal(r.body.reward?.amount, 2, '프로필 완성 보상');
  r = await alice.patch('/api/users/me', { email: 'new@example.com' });
  assert.equal(r.status, 400);
  r = await alice.patch('/api/users/me', { email: 'new@example.com', currentPassword: 'NewPass5678' });
  assert.equal(r.body.user.email, 'new@example.com');
  // 가짜 이미지 거부
  const fd = new FormData();
  fd.append('image', new Blob([Buffer.from('not an image at all')], { type: 'image/png' }), 'x.png');
  r = await alice.req('POST', '/api/users/me/avatar', undefined, { form: fd });
  assert.equal(r.status, 400);
});

test('웹툰 생성 → 편집 → 업로드 → 감상', async () => {
  let r = await alice.post('/api/webtoons', { title: '' , genre: '판타지' });
  assert.equal(r.status, 400);
  r = await alice.post('/api/webtoons', { title: '용사의 일기', genre: '없는장르' });
  assert.equal(r.status, 400);
  r = await alice.post('/api/webtoons', { title: '용사의 일기', genre: '판타지' });
  assert.equal(r.status, 201);
  ctx.webtoonId = r.body.webtoon.id;

  const up = await alice.upload('/api/uploads/image?kind=cover');
  r = await alice.patch(`/api/webtoons/${ctx.webtoonId}`, { coverUrl: up.body.url, thumbnailUrl: up.body.url, description: '소개', visibility: 'public', genre: '액션' });
  assert.equal(r.status, 200);
  r = await alice.patch(`/api/webtoons/${ctx.webtoonId}`, { coverUrl: 'javascript:alert(1)' });
  assert.equal(r.status, 400, '임의 URL 거부');
  r = await bob.patch(`/api/webtoons/${ctx.webtoonId}`, { title: '해킹' });
  assert.equal(r.status, 403, '타인 수정 불가');

  // 회차 생성 + 페이지 추가/순서변경 + 편집 데이터 저장
  r = await alice.post(`/api/webtoons/${ctx.webtoonId}/episodes`, { title: '1화 시작' });
  assert.equal(r.status, 201);
  ctx.ep1 = r.body.episode.id;
  r = await alice.post(`/api/episodes/${ctx.ep1}/pages`, {});
  assert.equal(r.body.episode.pages.length, 2);
  const pages = r.body.episode.pages;
  r = await alice.patch(`/api/episodes/${ctx.ep1}`, { pageOrder: [pages[1].id, pages[0].id] });
  assert.equal(r.body.episode.pages[0].id, pages[1].id);
  const doc = { version: 1, width: 800, height: 1200, background: '#ffffff', layers: [{ id: 'l1', name: '레이어 1', visible: true, opacity: 1, bitmap: null, items: [{ id: 'i1', type: 'bubble', x: 10, y: 10, w: 100, h: 60, text: '안녕' }] }] };
  r = await alice.put(`/api/editor-docs/${pages[0].editorDocId}`, { data: doc });
  assert.equal(r.status, 200);
  r = await bob.get(`/api/editor-docs/${pages[0].editorDocId}`);
  assert.equal(r.status, 403, '타인 편집데이터 접근 불가');
  r = await alice.get(`/api/editor-docs/${pages[0].editorDocId}`);
  assert.equal(r.body.data.layers[0].items[0].text, '안녕');

  // 임시저장 상태 회차는 다른 사람에게 안 보임
  r = await bob.get(`/api/episodes/${ctx.ep1}`);
  assert.equal(r.status, 404);

  // 업로드(즉시 공개)
  const img = await alice.upload('/api/uploads/image?kind=page');
  const ed = await alice.get(`/api/episodes/${ctx.ep1}/edit`);
  r = await alice.post(`/api/episodes/${ctx.ep1}/publish`, { mode: 'now', pages: ed.body.episode.pages.map((p) => ({ id: p.id, imageUrl: img.body.url, width: 800, height: 1200 })) });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.episode.status, 'published');
  assert.equal(r.body.reward?.amount, 2, '연재 보상');

  // 공개 목록에 노출
  r = await bob.get('/api/webtoons?genre=액션&sort=latest');
  assert.equal(r.body.items.length, 1);
  r = await bob.get('/api/webtoons?q=일기');
  assert.equal(r.body.items.length, 1);
  r = await bob.get('/api/webtoons?author=앨리스');
  assert.equal(r.body.items.length, 1);

  // 독자 감상 → 조회수 + 감상 보상, 새로고침해도 중복 없음
  r = await bob.get(`/api/episodes/${ctx.ep1}`);
  assert.equal(r.body.locked, false);
  assert.equal(r.body.pages.length, 2);
  assert.equal(r.body.reward?.amount, 1);
  r = await bob.get(`/api/episodes/${ctx.ep1}`);
  assert.equal(r.body.reward, null);
  const ep = await models.Episode.findById(ctx.ep1);
  assert.equal(ep.viewCount, 1);
});

test('관심 웹툰 + 새 회차 알림 + 예약 업로드 + 쿠키 미리보기', async () => {
  let r = await bob.post('/api/bookmarks', { targetType: 'webtoon', targetId: ctx.webtoonId, bookmark: true });
  assert.equal(r.body.bookmarkCount, 1);
  r = await bob.post('/api/bookmarks', { targetType: 'webtoon', targetId: ctx.webtoonId, bookmark: true });
  assert.equal(r.body.bookmarkCount, 1, '중복 관심 등록 방지');

  r = await alice.post(`/api/webtoons/${ctx.webtoonId}/episodes`, { title: '2화 예약' });
  ctx.ep2 = r.body.episode.id;
  const img = await alice.upload('/api/uploads/image?kind=page');
  const ed = await alice.get(`/api/episodes/${ctx.ep2}/edit`);
  const pages = ed.body.episode.pages.map((p) => ({ id: p.id, imageUrl: img.body.url }));
  r = await alice.post(`/api/episodes/${ctx.ep2}/publish`, { mode: 'schedule', publishAt: '2020-01-01T10:00', pages });
  assert.equal(r.status, 400, '과거 시각 예약 불가');
  // KST 기준 2시간 뒤
  const kst = new Date(Date.now() + 9 * 3600000 + 2 * 3600000).toISOString().slice(0, 16);
  r = await alice.post(`/api/episodes/${ctx.ep2}/publish`, { mode: 'schedule', publishAt: kst, pages });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.episode.status, 'scheduled');
  const diff = new Date(r.body.episode.publishAt).getTime() - Date.now();
  assert.ok(diff > 1.9 * 3600000 && diff < 2.1 * 3600000, 'KST → UTC 변환 정확');

  // 잠김 상태
  r = await bob.get(`/api/episodes/${ctx.ep2}`);
  assert.equal(r.body.locked, true);
  assert.equal(r.body.pages.length, 0);
  // 쿠키 3개로 구매 (bob: 10 + 감상 1 = 11)
  r = await bob.post(`/api/episodes/${ctx.ep2}/purchase`);
  assert.equal(r.status, 200);
  assert.equal(r.body.wallet.balance, 8);
  r = await bob.post(`/api/episodes/${ctx.ep2}/purchase`);
  assert.equal(r.body.alreadyOwned, true);
  assert.equal(r.body.wallet.balance, 8, '재구매 시 차감 없음');
  r = await bob.get(`/api/episodes/${ctx.ep2}`);
  assert.equal(r.body.locked, false);

  // 동시 구매 요청 → 1번만 차감
  const carol = new Client();
  await carol.post('/api/auth/register', { username: 'carol01', password: 'Pass1234', nickname: '캐롤' });
  const results = await Promise.all(Array.from({ length: 5 }, () => carol.post(`/api/episodes/${ctx.ep2}/purchase`)));
  assert.ok(results.every((x) => x.status === 200));
  const w = await models.CookieWallet.findOne({ user: (await models.User.findOne({ username: 'carol01' }))._id });
  assert.equal(w.balance, 7);
  const spends = await models.CookieTransaction.countDocuments({ user: w.user, type: 'spend' });
  assert.equal(spends, 1);

  // 예약 시간 도래 → 자동 공개 (스케줄러 처리)
  await models.Episode.updateOne({ _id: ctx.ep2 }, { $set: { publishAt: new Date(Date.now() - 1000) } });
  await models.ScheduledUpload.updateOne({ episode: ctx.ep2, status: 'pending' }, { $set: { publishAt: new Date(Date.now() - 1000) } });
  const n = await processDueSchedules();
  assert.equal(n, 1);
  r = await new Client().get(`/api/episodes/${ctx.ep2}`);
  assert.equal(r.body.locked, false, '비로그인도 감상 가능');
  r = await bob.get('/api/notifications');
  assert.ok(r.body.items.some((x) => x.type === 'new_episode'), '관심 웹툰 새 회차 알림');
  r = await bob.get('/api/notifications/unread-count');
  assert.ok(r.body.notifications >= 1);
  await bob.post('/api/notifications/read-all');
  r = await bob.get('/api/notifications/unread-count');
  assert.equal(r.body.notifications, 0);
});

test('댓글 + 좋아요(중복 방지) + 알림 + 쿠키 보상 한도', async () => {
  let r = await bob.post('/api/comments', { targetType: 'episode', targetId: ctx.ep1, content: '정말 재밌어요!!' });
  assert.equal(r.status, 201);
  assert.equal(r.body.reward?.amount, 1);
  r = await bob.post('/api/comments', { targetType: 'episode', targetId: ctx.ep1, content: '두번째 댓글입니다' });
  assert.equal(r.body.reward, null, '같은 회차 댓글 중복 보상 없음');
  r = await bob.post('/api/comments', { targetType: 'episode', targetId: ctx.ep1, content: '<script>alert(1)</script>' });
  assert.equal(r.status, 201);
  r = await bob.get(`/api/comments?targetType=episode&targetId=${ctx.ep1}`);
  assert.equal(r.body.total, 3);
  r = await alice.get('/api/notifications');
  assert.ok(r.body.items.some((x) => x.type === 'comment'));

  r = await bob.post('/api/likes', { targetType: 'webtoon', targetId: ctx.webtoonId, like: true });
  r = await bob.post('/api/likes', { targetType: 'webtoon', targetId: ctx.webtoonId, like: true });
  assert.equal(r.body.likeCount, 1);
  r = await bob.post('/api/likes', { targetType: 'webtoon', targetId: ctx.webtoonId, like: false });
  assert.equal(r.body.likeCount, 0);
  r = await bob.post('/api/likes', { targetType: 'episode', targetId: ctx.ep1, like: true });
  assert.equal(r.body.likeCount, 1);

  // 감상 보상 일일 한도(5) 확인: 에피소드 6개를 만들어 감상
  const img = await alice.upload('/api/uploads/image?kind=page');
  let rewards = 0;
  for (let i = 0; i < 6; i += 1) {
    const e = await alice.post(`/api/webtoons/${ctx.webtoonId}/episodes`, { title: `추가 ${i}` });
    const ed = await alice.get(`/api/episodes/${e.body.episode.id}/edit`);
    await alice.post(`/api/episodes/${e.body.episode.id}/publish`, { mode: 'now', pages: ed.body.episode.pages.map((p) => ({ id: p.id, imageUrl: img.body.url })) });
    const v = await bob.get(`/api/episodes/${e.body.episode.id}`);
    if (v.body.reward) rewards += 1;
  }
  // 이미 ep1, ep2(구매 후 감상) 에서 2회 받았으므로 오늘 남은 한도 3
  assert.equal(rewards, 3, '일일 감상 보상 한도 5');
  const pub = await models.RewardLog.countDocuments({ type: 'publish_episode' });
  assert.equal(pub, 1, '연재 보상 하루 1회');
});

test('출석체크 하루 1회', async () => {
  let r = await bob.post('/api/cookies/attendance');
  assert.equal(r.status, 200);
  assert.equal(r.body.reward, 1);
  r = await bob.post('/api/cookies/attendance');
  assert.equal(r.status, 409);
  r = await bob.get('/api/cookies/summary');
  assert.equal(r.body.attendance.checkedToday, true);
  r = await bob.get('/api/cookies/transactions?type=spend');
  assert.equal(r.body.items.length, 1);
  assert.equal(r.body.items[0].amount, -3);
});

test('관리자 쿠키 선물 → 수신함 수령 (중복 수령 불가)', async () => {
  let r = await admin.get('/api/admin/cookies/find-user?username=bob');
  assert.equal(r.body.items[0].username, 'bob0001');
  r = await admin.post('/api/admin/cookies/send', { username: 'bob0001', amount: 50, message: '이벤트 당첨' });
  assert.equal(r.status, 201);
  r = await bob.post('/api/admin/cookies/send', { username: 'bob0001', amount: 50 });
  assert.equal(r.status, 403, '일반 사용자는 지급 불가');
  const before = (await bob.get('/api/cookies/summary')).body.wallet.balance;
  r = await bob.get('/api/inbox');
  assert.equal(r.body.unclaimed, 1);
  const id = r.body.items[0].id;
  const claims = await Promise.all([bob.post(`/api/inbox/${id}/claim`), bob.post(`/api/inbox/${id}/claim`), bob.post(`/api/inbox/${id}/claim`)]);
  assert.equal(claims.filter((c) => c.status === 200).length, 1, '동시 수령해도 1번만');
  r = await bob.get('/api/cookies/summary');
  assert.equal(r.body.wallet.balance, before + 50);
  r = await bob.get('/api/cookies/transactions?type=receive');
  assert.equal(r.body.items[0].amount, 50);
  r = await bob.get('/api/notifications');
  assert.ok(r.body.items.some((x) => x.type === 'cookie_gift'));
  // 관리자는 무제한 (미리보기 시 차감 없음)
  r = await admin.get('/api/cookies/summary');
  assert.equal(r.body.wallet.unlimited, true);
});

test('일러스트: 생성 → 업로드 → 좋아요/저장/댓글 → 검색', async () => {
  let r = await alice.post('/api/illustrations', { title: '노을 풍경' });
  assert.equal(r.status, 201);
  ctx.ill = r.body.illustration.id;
  r = await bob.get(`/api/illustrations/${ctx.ill}`);
  assert.equal(r.status, 404, '임시저장 그림 비공개');
  const img = await alice.upload('/api/uploads/image?kind=illustration');
  r = await alice.post(`/api/illustrations/${ctx.ill}/publish`, { imageUrl: img.body.url, width: 40, height: 30, tags: ['#풍경', '노을'], description: '저녁' });
  assert.equal(r.status, 200);
  assert.equal(r.body.reward?.amount, 1);
  r = await bob.get('/api/illustrations?q=풍경');
  assert.equal(r.body.items.length, 1);
  r = await bob.post('/api/likes', { targetType: 'illustration', targetId: ctx.ill, like: true });
  assert.equal(r.body.likeCount, 1);
  r = await bob.post('/api/bookmarks', { targetType: 'illustration', targetId: ctx.ill, bookmark: true });
  assert.equal(r.body.bookmarkCount, 1);
  r = await bob.post('/api/comments', { targetType: 'illustration', targetId: ctx.ill, content: '색감 최고!' });
  assert.equal(r.status, 201);
  r = await bob.get('/api/users/me/saved');
  assert.equal(r.body.illustrations.length, 1);
  assert.equal(r.body.webtoons.length, 1);
  r = await alice.get('/api/notifications');
  assert.ok(r.body.items.some((x) => x.type === 'like'));
});

test('홈 화면 / 공개 프로필', async () => {
  const r = await new Client().get('/api/home');
  assert.equal(r.status, 200);
  assert.ok(r.body.popularWebtoons.length >= 1);
  assert.ok(r.body.latestIllustrations.length >= 1);
  assert.ok(r.body.creators.length >= 1);
  const p = await new Client().get('/api/users/alice01');
  assert.equal(p.body.user.nickname, '앨리스작가');
  assert.equal(p.body.user.email, undefined, '공개 프로필에 이메일 노출 안 됨');
});

test('관리자: 콘텐츠 숨김/댓글 삭제/신고 처리/계정 정지', async () => {
  let r = await bob.post('/api/reports', { targetType: 'illustration', targetId: ctx.ill, reason: '부적절합니다' });
  assert.equal(r.status, 201);
  r = await admin.get('/api/admin/reports');
  assert.equal(r.body.items.length, 1);
  r = await admin.post(`/api/admin/reports/${r.body.items[0].id}/resolve`, { action: 'hide' });
  assert.equal(r.status, 200);
  r = await bob.get(`/api/illustrations/${ctx.ill}`);
  assert.equal(r.status, 404, '숨김 처리된 그림은 비공개');
  r = await admin.get('/api/admin/comments');
  const cid = r.body.items[0].id;
  r = await admin.del(`/api/admin/comments/${cid}`);
  assert.equal(r.status, 200);
  r = await admin.get('/api/admin/users?q=bob');
  const bobId = r.body.items[0].id;
  r = await admin.post(`/api/admin/users/${bobId}/status`, { status: 'suspended', reason: '테스트' });
  assert.equal(r.status, 200);
  r = await bob.get('/api/cookies/summary');
  assert.equal(r.status, 401, '정지 즉시 세션 만료');
  r = await new Client().post('/api/auth/login', { username: 'bob0001', password: 'Pass1234' });
  assert.equal(r.status, 403);
  r = await admin.get(`/api/admin/users/${bobId}`);
  assert.equal(r.body.user.status, 'suspended');
});

test('회차 삭제 시 카운터 정리 + 웹툰 삭제 연쇄', async () => {
  const before = await models.Webtoon.findById(ctx.webtoonId);
  let r = await alice.del(`/api/episodes/${ctx.ep1}`);
  assert.equal(r.status, 200);
  const afterW = await models.Webtoon.findById(ctx.webtoonId);
  assert.equal(afterW.publishedEpisodeCount, before.publishedEpisodeCount - 1);
  r = await alice.del(`/api/webtoons/${ctx.webtoonId}`);
  assert.equal(r.status, 200);
  assert.equal(await models.Episode.countDocuments({ webtoon: ctx.webtoonId }), 0);
  assert.equal(await models.Bookmark.countDocuments({ target: ctx.webtoonId }), 0);
});
