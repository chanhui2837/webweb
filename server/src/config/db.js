import mongoose from 'mongoose';
import { env } from './env.js';

mongoose.set('strictQuery', true);

export async function connectDB(uri = env.mongoUri) {
  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 15000,
    maxPoolSize: 20,
  });
  // 모든 모델의 인덱스를 생성(이미 있으면 무시)
  await Promise.all(Object.values(mongoose.models).map((m) => m.syncIndexes().catch((e) => {
    console.warn(`[db] ${m.modelName} 인덱스 동기화 경고:`, e.message);
  })));
  console.log('[db] MongoDB 연결 완료');
  return mongoose.connection;
}

export async function disconnectDB() {
  await mongoose.disconnect();
}
