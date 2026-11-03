import { env } from './config/env.js';
import { connectDB, disconnectDB } from './config/db.js';
import './models/index.js';
import { createApp } from './app.js';
import { bootstrapAdmin } from './services/adminBootstrap.js';
import { startScheduler, stopScheduler } from './services/episodeService.js';
import { useCloudinary } from './services/storage.js';

async function main() {
  await connectDB();
  await bootstrapAdmin();
  startScheduler();
  const app = createApp();
  const server = app.listen(env.port, '0.0.0.0', () => {
    console.log(`[server] WEBWEB 실행 중 — PORT ${env.port} (${env.isProd ? 'production' : 'development'})`);
    console.log(`[server] 이미지 저장소: ${useCloudinary ? 'Cloudinary' : '로컬 디스크(개발용)'}`);
  });

  const shutdown = async (sig) => {
    console.log(`[server] ${sig} 수신 — 종료합니다.`);
    stopScheduler();
    server.close(async () => {
      await disconnectDB().catch(() => {});
      process.exit(0);
    });
    setTimeout(() => process.exit(0), 8000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((e) => {
  console.error('[server] 시작 실패:', e);
  process.exit(1);
});
