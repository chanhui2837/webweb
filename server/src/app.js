import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import { env } from './config/env.js';
import { csrfProtection } from './middleware/auth.js';
import { apiLimiter } from './middleware/rateLimits.js';
import { errorHandler } from './utils/http.js';
import { LOCAL_UPLOAD_DIR } from './services/storage.js';
import apiRouter from './routes/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLIENT_DIST = path.resolve(__dirname, '../../client/dist');

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', env.trustProxy); // Render 프록시 뒤에서 실제 IP 인식

  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          'default-src': ["'self'"],
          'img-src': ["'self'", 'data:', 'blob:', 'https://res.cloudinary.com'],
          'style-src': ["'self'", "'unsafe-inline'", 'https://cdn.jsdelivr.net', 'https://fonts.googleapis.com'],
          'font-src': ["'self'", 'data:', 'https://cdn.jsdelivr.net', 'https://fonts.gstatic.com'],
          'connect-src': ["'self'", 'https://res.cloudinary.com'],
          'script-src': ["'self'"],
          'object-src': ["'none'"],
          'frame-ancestors': ["'none'"],
          'upgrade-insecure-requests': env.isProd ? [] : null,
        },
      },
      crossOriginEmbedderPolicy: false,
      crossOriginResourcePolicy: { policy: 'same-site' },
    })
  );
  app.use(compression());
  app.use(cookieParser());
  // 편집기 원본(레이어 PNG 포함)을 저장하므로 JSON 한도를 넉넉히 둔다 (DB 문서 한도 16MB 미만)
  app.use('/api/editor-docs', express.json({ limit: '14mb' }));
  app.use(express.json({ limit: '200kb' }));

  app.get('/healthz', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

  app.use('/api', apiLimiter, csrfProtection, apiRouter);
  app.use('/api', (req, res) => res.status(404).json({ error: '존재하지 않는 API 입니다.', code: 'NOT_FOUND' }));

  // Cloudinary 미설정 시 로컬 업로드 파일 제공 (개발용)
  app.use('/uploads', express.static(LOCAL_UPLOAD_DIR, { maxAge: '7d', fallthrough: false }));

  // React 빌드 결과물 제공 + SPA 라우팅
  if (fs.existsSync(CLIENT_DIST)) {
    app.use(express.static(CLIENT_DIST, { maxAge: '1h', index: false }));
    app.get('*', (req, res) => res.sendFile(path.join(CLIENT_DIST, 'index.html')));
  } else {
    app.get('/', (req, res) => res.type('text').send('WEBWEB API 서버 실행 중. (client 빌드 결과물이 없습니다: npm run build)'));
  }

  app.use(errorHandler);
  return app;
}
