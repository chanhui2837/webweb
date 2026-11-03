import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// 루트(.env) 또는 server/.env 어느 쪽이든 읽는다.
dotenv.config({ path: path.resolve(__dirname, '../../../.env'), quiet: true });
dotenv.config({ path: path.resolve(__dirname, '../../.env'), quiet: true });

const isProd = process.env.NODE_ENV === 'production';

function required(name, fallbackForDev) {
  const v = process.env[name];
  if (v && v.trim()) return v.trim();
  if (!isProd && fallbackForDev !== undefined) return fallbackForDev;
  throw new Error(`[env] 필수 환경변수 ${name} 이(가) 설정되지 않았습니다.`);
}

export const env = {
  isProd,
  isTest: process.env.NODE_ENV === 'test',
  port: Number(process.env.PORT) || 4000,
  mongoUri: required('MONGODB_URI', 'mongodb://127.0.0.1:27017/webweb'),
  jwtSecret: required('JWT_SECRET', 'dev-only-insecure-secret-change-me'),
  jwtExpiresDays: Number(process.env.JWT_EXPIRES_DAYS) || 14,
  clientOrigin: process.env.CLIENT_ORIGIN || '',
  admin: {
    username: (process.env.ADMIN_USERNAME || 'chanhui2837').trim().toLowerCase(),
    initialPassword: process.env.ADMIN_INITIAL_PASSWORD || '',
    nickname: process.env.ADMIN_NICKNAME || '웹웹관리자',
  },
  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME || '',
    apiKey: process.env.CLOUDINARY_API_KEY || '',
    apiSecret: process.env.CLOUDINARY_API_SECRET || '',
    folder: process.env.CLOUDINARY_FOLDER || 'webweb',
  },
  smtp: {
    host: process.env.SMTP_HOST || '',
    port: Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true',
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.MAIL_FROM || process.env.SMTP_USER || '',
  },
  twilio: {
    accountSid: process.env.TWILIO_ACCOUNT_SID || '',
    authToken: process.env.TWILIO_AUTH_TOKEN || '',
    from: process.env.TWILIO_FROM || '',
  },
  // 개발 환경에서 메일/SMS 서비스가 없을 때 인증번호를 서버 콘솔에 출력할지 여부
  devLogCodes: !isProd && process.env.DEV_LOG_CODES !== 'false',
  trustProxy: process.env.TRUST_PROXY ? Number(process.env.TRUST_PROXY) : 1,
};
