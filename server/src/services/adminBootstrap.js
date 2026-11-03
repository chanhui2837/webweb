import bcrypt from 'bcryptjs';
import { env } from '../config/env.js';
import { User, nicknameKeyOf } from '../models/index.js';
import { getWallet } from './cookieService.js';

/**
 * 최초 관리자 계정 초기화.
 * - ADMIN_USERNAME(기본 chanhui2837)은 일반 회원가입에서 예약어로 막혀 있어 누구도 선점할 수 없다.
 * - 계정이 없으면 ADMIN_INITIAL_PASSWORD 로 서버가 직접 생성하고 role=admin 을 부여한다.
 * - 이미 존재하면 role 을 admin 으로 보장한다(부트스트랩 생성 계정에 한해).
 */
export async function bootstrapAdmin() {
  const username = env.admin.username;
  if (!username) return;
  const existing = await User.findOne({ username });
  if (existing) {
    if (existing.role !== 'admin') {
      if (existing.bootstrapAdmin) {
        existing.role = 'admin';
        await existing.save();
      } else {
        console.warn(`[admin] ⚠ '${username}' 계정이 일반 계정으로 존재합니다. 자동 승격하지 않습니다. 본인 계정이 맞다면 서버에서 "npm run admin:promote --prefix server" 를 실행하세요.`);
      }
    }
    return;
  }
  if (!env.admin.initialPassword) {
    console.warn(`[admin] ADMIN_INITIAL_PASSWORD 가 없어 관리자 계정 '${username}' 을(를) 만들지 않았습니다. 환경변수를 설정하고 서버를 재시작하세요.`);
    return;
  }
  if (env.admin.initialPassword.length < 8) {
    console.warn('[admin] ADMIN_INITIAL_PASSWORD 는 8자 이상이어야 합니다. 관리자 계정을 만들지 않았습니다.');
    return;
  }
  let nickname = env.admin.nickname;
  if (await User.exists({ nicknameKey: nicknameKeyOf(nickname) })) nickname = `${nickname}_${Date.now().toString(36).slice(-4)}`;
  const user = await User.create({
    username,
    passwordHash: await bcrypt.hash(env.admin.initialPassword, 12),
    nickname,
    nicknameKey: nicknameKeyOf(nickname),
    role: 'admin',
    bootstrapAdmin: true,
  });
  await getWallet(user._id);
  console.log(`[admin] 관리자 계정 '${username}' 생성 완료. 로그인 후 프로필에서 비밀번호를 변경하세요.`);
}
