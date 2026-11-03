# 웹웹 (WEBWEB)

브라우저에서 바로 컷을 나누고, 말풍선을 얹고, 웹툰을 연재하는 **웹툰 & 일러스트 창작 플랫폼**입니다.
회원가입 → 웹툰/그림 제작(직접 그리는 편집기) → 즉시·예약 업로드 → 감상·댓글·좋아요·관심 등록 → 쿠키 재화까지 실제로 동작하는 풀스택 서비스입니다.

---

## 1. 주요 기능

| 영역 | 기능 |
|---|---|
| 회원 | 회원가입(아이디·비밀번호·닉네임 필수 / 이메일·전화번호 선택), 중복·형식·비밀번호 강도 검증, 로그인 유지, 로그아웃, 5회 실패 시 15분 잠금, 이메일/문자 인증번호로 아이디 찾기·비밀번호 재설정 |
| 프로필 | 프로필 사진 업로드, 닉네임·자기소개·이메일·전화번호(현재 비밀번호 확인)·비밀번호 변경, 내 웹툰·내 그림·저장한 작품, 공개 프로필 페이지 |
| 메인 | 추천(관심 장르 가중치)·인기·최근 업데이트·새 웹툰, 인기·최신 일러스트, 창작자 추천 |
| 프로젝트 | 웹툰 생성(제목·장르 필수), 표지·썸네일·소개·장르·공개 설정, 회차 생성/편집/미리보기/임시저장/수정/삭제, 즉시 공개·예약 공개·예약 취소, 그림 프로젝트 |
| 편집기 | 브러시(필압)·지우개·크기·색·불투명도, 확대/축소(Ctrl+휠·두 손가락)·화면 이동, 실행 취소/다시 실행(50단계), 캔버스 크기·배경, 이미지 불러오기·크기 조절, 컷 프레임 + 컷 레이아웃 6종, 효과선, 집중선, 아이템 이동·크기·복제·앞뒤 순서, 2분 자동 임시저장 |
| 말풍선 17종 | 대사: 기본·둥근 사각·생각·속삭임(점선)·무테 독백·이중선(회상) / 감정: 외침·거대 외침·떨리는 목소리·플래시 독백·하트·흘러내림(공포) / 상자: 사각 대사상자·검은 나레이션 / 특수: 전화·기계음(번개 꼬리)·메신저 채팅·게임 상태창(제목 띠, 빛나는 테두리). 꼬리 방향 조절, 종류는 놓은 뒤에도 변경 가능 |
| 장식·텍스트 | 감정 기호(땀방울·분노 마크·홍조 빗금·반짝반짝·음표·우울 세로선), 배경(스크린톤·그라데이션·베타 플래시·번개·스마트폰 화면), 도형(별·하트·폭발·반짝이 등). 효과음용 텍스트 외곽선·기울기·자간·그림자, 웹툰용 글꼴 6종 |
| 레이어 | 종류 프리셋(일반·스케치·선화·밑색·명암·빛·발광·분위기·배경·효과·식자), 혼합 모드 16종(곱하기·스크린·더하기·오버레이 등), 아래 레이어에 클리핑, 투명도 잠금, 레이어 잠금, 복제, 아래로 합치기, 숨김·불투명도·순서·이름 (최대 30개) |
| 장 합치기 | 회차 안의 장을 "아래 장과 합치기"로 위아래 이어 붙여 긴 한 장으로. 합친 장을 또 합칠 수 있어 횟수 제한 없음, "전체를 한 장으로 합치기"도 가능. 같은 순서 레이어끼리 합쳐지고 말풍선 등은 위치가 그대로 이동. 세로 최대 500,000px |
| 감상 | 웹툰 목록(장르·제목·작가 검색, 인기·최신·조회수·업데이트순), 상세·회차 목록, 세로 스크롤 감상, 이전/다음화, 조회수(하루 1회 집계)·좋아요, 관심 웹툰 |
| 그림 | 최신·인기 그림, 제목·태그·작가 검색, 상세, 좋아요·저장(사용자별 1회), 댓글 |
| 쿠키 | 가입 시 10개, 출석(하루 1회, 7일 연속 보너스), 감상·댓글·연재·그림 업로드·좋아요·프로필 완성 보상(활동별 일일 한도 + 같은 대상 중복 보상 금지), 예약 회차 미리보기 3개(재구매 시 미차감), 전체 변동 내역 |
| 수신함·알림 | 관리자 쿠키 선물 수령(원자적, 중복 수령 불가), 관심 웹툰 새 회차·좋아요·댓글·선물·운영 조치 알림, 읽음/안 읽음 |
| 관리자 | 대시보드, 쿠키 지급(아이디 검색 → 수량 → 전송 → 수신함 수령), 쿠키 직접 조정, 사용자 검색·상세 활동·정지/해제·잠금 해제·권한, 웹툰/회차/그림 숨김·삭제, 댓글 숨김·삭제, 신고 처리 |

## 2. 사용 기술

- **백엔드**: Node.js 18+ · Express 4 · Mongoose 9 (MongoDB Atlas) · zod(입력 검증) · bcryptjs · JWT(httpOnly 쿠키) · helmet(CSP) · express-rate-limit · multer · Cloudinary · nodemailer
- **프론트엔드**: React 19 · React Router 7 · Vite · 순수 Canvas 2D 편집기(외부 그래픽 라이브러리 없음)
- **배포**: Render Web Service 1개 (Express 가 API 와 React 빌드 결과물을 함께 제공)

## 3. 폴더 구조

```
webweb/
├─ package.json          # 루트: build(서버·클라이언트 설치 + React 빌드), start
├─ render.yaml           # Render Blueprint
├─ .env.example          # 환경변수 예시
├─ server/
│  ├─ src/
│  │  ├─ index.js        # 서버 시작 (DB 연결 → 관리자 초기화 → 예약 스케줄러 → listen(PORT))
│  │  ├─ app.js          # 보안 미들웨어, /api, 정적 파일, SPA 라우팅
│  │  ├─ config/         # env.js, db.js
│  │  ├─ models/         # User, Content(Webtoon/Episode/Illustration/EditorDoc), Social, Cookie, System
│  │  ├─ middleware/     # auth(JWT·CSRF·관리자), rateLimits, upload
│  │  ├─ routes/         # auth, users, uploads, webtoons, episodes, editorDocs, illustrations, social, cookies, home, admin
│  │  ├─ services/       # cookieService, episodeService(예약), notificationService, storage, messenger, contentService, adminBootstrap
│  │  ├─ utils/          # http(에러·검증), validators, time(KST), serialize
│  │  └─ scripts/promoteAdmin.js
│  └─ test/api.test.js   # 실제 MongoDB 로 돌리는 API 통합 테스트 (15개 시나리오)
└─ client/
   ├─ index.html
   └─ src/
      ├─ App.jsx, main.jsx, styles.css
      ├─ lib/ (api.js, format.js)   context/ (Auth, Toast)
      ├─ components/ (Layout, Logo, ui, Comments, ReportButton)
      ├─ editor/ (core.js 그리기 엔진, Editor.jsx 편집기 UI)
      └─ pages/ (Home, Webtoons, WebtoonDetail, EpisodeReader, Illustrations, ..., Admin)
```

### MongoDB 컬렉션

`users`, `webtoons`, `episodes`, `illustrations`, `editordocs`(편집기 레이어 구조·말풍선 등), `editortiles`(레이어 그림을 1024px 타일로 나눠 저장 — 그린 곳만 저장해서 긴 장도 가볍게), `comments`, `likes`, `bookmarks`, `reports`, `viewlogs`(조회수 중복 방지, TTL),
`cookies`(사용자별 쿠키 지갑), `cookietransactions`(모든 변동 내역), `cookieinbox`(관리자 선물), `episodepurchases`(미리보기 구매), `rewardlogs`·`dailyrewardcounters`(보상 중복/한도 방지), `attendance`,
`notifications`, `scheduleduploads`(예약 업로드 작업), `verificationcodes`(본인 확인, TTL)

필요한 인덱스(유니크·복합·TTL)는 서버 시작 시 자동으로 생성됩니다.

## 4. 설치 방법

Node.js 18.18 이상(권장 22)이 필요합니다.

```bash
cd webweb
npm run install:all        # server, client 의존성 설치
cp .env.example .env       # 환경변수 파일 만들기 → 값 채우기
```

## 5. 로컬 실행 방법

**개발 모드** (터미널 2개):

```bash
npm run dev:server   # http://localhost:4000  (API, 코드 변경 시 자동 재시작)
npm run dev:client   # http://localhost:5173  (React, /api 는 4000 으로 프록시)
```

브라우저에서 `http://localhost:5173` 을 엽니다.

**배포와 같은 방식으로 실행**:

```bash
npm run build && npm start   # http://localhost:4000
```

로컬 개발 시 `.env` 에 `NODE_ENV` 를 비워 두면:
- `MONGODB_URI` 가 없을 때 `mongodb://127.0.0.1:27017/webweb` 를 사용합니다.
- Cloudinary 설정이 없으면 이미지를 `server/uploads/` 에 저장합니다.
- 메일/문자 서비스가 없으면 아이디·비밀번호 찾기 인증번호를 **서버 콘솔에 출력**합니다(`DEV_LOG_CODES=false` 로 끌 수 있음).

**테스트** (MongoDB 가 실행 중이어야 함, 테스트 DB 를 비우고 시작):

```bash
MONGODB_URI_TEST="mongodb://127.0.0.1:27017/webweb_test" npm test
```

## 6. MongoDB Atlas 연결 방법

1. https://cloud.mongodb.com 에서 무료(M0) 클러스터를 만듭니다.
2. **Database Access** → 사용자 추가 (아이디/비밀번호 기억).
3. **Network Access** → `0.0.0.0/0` 허용 (Render 는 고정 IP 가 없으므로).
4. **Database → Connect → Drivers** 에서 연결 문자열을 복사해 `<password>` 를 바꾸고, `.net/` 뒤에 DB 이름 `webweb` 을 넣습니다.
   ```
   MONGODB_URI=mongodb+srv://webweb_user:비밀번호@cluster0.abcde.mongodb.net/webweb?retryWrites=true&w=majority
   ```
   비밀번호에 `@ : / ? #` 같은 특수문자가 있으면 URL 인코딩해야 합니다.

## 7. 환경변수 설정 방법

| 변수 | 필수 | 설명 |
|---|---|---|
| `MONGODB_URI` | ✅ | MongoDB Atlas 연결 문자열 |
| `JWT_SECRET` | ✅ | 로그인 토큰 서명 비밀키 (32자 이상 무작위, `openssl rand -hex 32`) |
| `NODE_ENV` | ✅(배포) | `production` — HTTPS 전용 쿠키, 필수값 검사 활성화 |
| `ADMIN_USERNAME` | | 최초 관리자 아이디 (기본 `chanhui2837`) |
| `ADMIN_INITIAL_PASSWORD` | ✅(최초 1회) | 관리자 계정이 없을 때 이 비밀번호로 생성. 8자 이상 |
| `ADMIN_NICKNAME` | | 관리자 닉네임 (기본 `웹웹관리자`) |
| `CLOUDINARY_CLOUD_NAME` / `_API_KEY` / `_API_SECRET` | ✅(배포) | 이미지 영구 저장소 |
| `CLOUDINARY_FOLDER` | | Cloudinary 폴더 이름 (기본 `webweb`) |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_SECURE` / `SMTP_USER` / `SMTP_PASS` / `MAIL_FROM` | 권장 | 이메일 인증번호 발송 |
| `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` / `TWILIO_FROM` | 선택 | 문자 인증번호 발송 |
| `PORT` | | Render 가 자동 지정. 로컬 기본 4000 |
| `JWT_EXPIRES_DAYS` | | 로그인 유지 기간 (기본 14일) |
| `TRUST_PROXY` | | 프록시 단계 수 (Render 는 1, 기본값) |

### 관리자 계정 동작 방식

- 관리자 권한은 **DB 의 `role` 값으로 서버에서만** 판단합니다. 프론트엔드의 아이디 비교는 권한과 무관합니다.
- `ADMIN_USERNAME`(chanhui2837)은 일반 회원가입에서 **예약어로 막혀** 누구도 먼저 가입할 수 없습니다.
- 서버가 시작될 때 그 계정이 없으면 `ADMIN_INITIAL_PASSWORD` 로 **서버가 직접** 만들고 `role=admin` 을 줍니다.
- 첫 로그인 후 **프로필 → 비밀번호 변경**으로 비밀번호를 바꾸세요. (이후 환경변수 값은 사용되지 않습니다.)
- 관리자 쿠키는 무제한이며 선물을 보내도 차감되지 않습니다.
- 다른 계정을 서버에서 직접 관리자로 지정하려면: `npm run admin:promote --prefix server -- 아이디` (Render Shell 등 서버 셸에서)

## 8. Cloudinary 연결 방법

Render 의 디스크는 재배포·재시작 때마다 초기화되므로 업로드 이미지는 반드시 외부 저장소에 둬야 합니다.

1. https://cloudinary.com 무료 가입 → **Dashboard** (또는 Settings → API Keys).
2. `Cloud name`, `API Key`, `API Secret` 을 환경변수에 넣습니다.
3. 끝. 서버 로그에 `이미지 저장소: Cloudinary` 가 표시되면 정상입니다.

업로드 규칙: PNG·JPG·WEBP·GIF, 최대 10MB, 확장자가 아니라 **파일 시그니처(매직 바이트)로 실제 형식을 검사**합니다. 회차를 업로드하면 각 장을 브라우저에서 렌더링하고, 긴 장은 세로 1600px 단위로 잘라 여러 이미지로 올립니다(감상 화면에서는 끊김 없이 이어짐). 편집 원본(레이어 구조·말풍선은 `editordocs`, 레이어 그림은 `editortiles`)은 MongoDB 에 남아 언제든 다시 편집할 수 있습니다.

## 9. Render 배포 방법

### 방법 A — Blueprint (권장)
1. 이 프로젝트를 GitHub 저장소에 올립니다(`.env` 는 올리지 마세요. `.gitignore` 에 포함됨).
2. Render → **New → Blueprint** → 저장소 선택. `render.yaml` 이 자동 인식됩니다.
3. 비어 있는 환경변수(`MONGODB_URI`, `ADMIN_INITIAL_PASSWORD`, `CLOUDINARY_*`, 메일 설정)를 입력하고 **Apply**.

### 방법 B — 직접 Web Service 생성
1. Render → **New → Web Service** → 저장소 연결.
2. 설정:
   - **Runtime**: Node
   - **Build Command**: `npm run build`
   - **Start Command**: `npm start`
   - **Health Check Path**: `/healthz`
3. **Environment** 에 7장의 변수를 입력 (`NODE_ENV=production`, `NODE_VERSION=22` 포함).
4. **Create Web Service** → 빌드가 끝나면 `https://<서비스이름>.onrender.com` 으로 접속.

배포 확인 체크리스트:
- 로그에 `MongoDB 연결 완료`, `관리자 계정 'chanhui2837' 생성 완료`(최초 1회), `이미지 저장소: Cloudinary` 가 보이는지
- `/healthz` 가 `{"ok":true}` 를 반환하는지
- 관리자 로그인 후 상단 메뉴에 **관리자**가 보이는지

참고: Render 무료 플랜은 15분간 요청이 없으면 잠들었다가 첫 요청 때 깨어납니다. 예약 업로드는 서버가 깨어 있는 동안 30초마다 처리되며, 잠들어 있던 사이 지난 예약은 **깨어나는 즉시** 공개 처리됩니다(예약 정보는 DB 에 있으므로 사라지지 않음). 정확한 시각 공개가 중요하면 유료 플랜(항상 켜짐)을 쓰거나 외부 모니터링 서비스로 `/healthz` 를 주기적으로 호출하세요.

## 10. 보안 설계 요약

- 비밀번호 bcrypt(12 rounds) 해시, 비밀번호에 아이디 포함 금지, 영문+숫자 8자 이상
- JWT 를 **httpOnly + SameSite=Lax + (배포 시) Secure** 쿠키로 보관 → JS 에서 토큰 탈취 불가
- 비밀번호 변경·재설정·계정 정지 시 `tokenVersion` 증가로 기존 세션 즉시 무효화
- CSRF: Double-submit 토큰(`ww_csrf` 쿠키 ↔ `X-CSRF-Token` 헤더) + SameSite
- XSS: React 자동 이스케이프 + helmet CSP(스크립트는 자기 도메인만) + 이미지 URL 은 업로드된 주소만 허용
- 로그인 시도 제한(IP+아이디 15분 10회, 계정 5회 실패 시 15분 잠금), 가입·인증·업로드·작성 요청 제한
- 본인확인: 6자리 코드 HMAC 해시 저장, 10분 만료, 5회 시도 제한, 60초 재요청 제한, 가입 여부 비노출, 재설정 토큰 1회용
- 모든 수정/삭제 API 에서 작성자 본인(또는 관리자) 검증, 관리자 API 는 서버에서 `role=admin` 확인
- 쿠키: 멱등 키(유니크 인덱스) + 조건부 원자 연산(`balance >= 가격`)으로 **중복 지급/차감·음수 잔액 방지**, 동시 요청 테스트 포함
- 입력 검증: 모든 API 를 zod 스키마로 검증, 정규식 검색어 이스케이프, 요청 본문 크기 제한

## 11. 알려 두는 점

- 아이디·비밀번호 찾기는 **SMTP(이메일) 또는 Twilio(문자)** 를 설정해야 배포 환경에서 동작합니다. 설정하지 않은 방법은 화면에서 비활성화됩니다.
- 회원가입 시 이메일·전화번호 자체의 소유 인증(가입 즉시 인증)은 하지 않으며, 찾기 단계에서 인증번호로 본인을 확인합니다.
- 실시간 기능은 Socket.IO 대신 30초 주기 알림 확인으로 구현했습니다(Render 무료 플랜의 슬립과 충돌하지 않도록).
- 편집기는 화면에 보이는 부분만 그리고, 그림은 1024px 타일로 나눠 바뀐 부분만 저장합니다. 그래서 장을 계속 합쳐 아주 길어져도 저장·편집이 가볍습니다. (한 장 세로 최대 500,000px, 아이템 3,000개, 레이어 30개)
