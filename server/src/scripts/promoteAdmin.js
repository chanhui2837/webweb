// 사용법: node src/scripts/promoteAdmin.js [아이디]
// 서버 셸(Render Shell 등)에서만 실행 가능 — 데이터베이스에 직접 접근해 관리자 권한을 부여한다.
import { connectDB, disconnectDB } from '../config/db.js';
import { env } from '../config/env.js';
import { User } from '../models/index.js';

const username = (process.argv[2] || env.admin.username).toLowerCase();
await connectDB();
const user = await User.findOneAndUpdate({ username }, { $set: { role: 'admin', bootstrapAdmin: true } }, { returnDocument: 'after' });
console.log(user ? `✅ '${username}' 계정에 관리자 권한을 부여했습니다.` : `❌ '${username}' 계정을 찾을 수 없습니다.`);
await disconnectDB();
