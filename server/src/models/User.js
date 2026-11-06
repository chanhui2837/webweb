import mongoose from 'mongoose';

const { Schema } = mongoose;

const userSchema = new Schema(
  {
    // 로그인 아이디 (소문자로 정규화하여 저장)
    username: { type: String, required: true, trim: true, lowercase: true },
    passwordHash: { type: String, required: true, select: false },
    nickname: { type: String, required: true, trim: true },
    // 닉네임 중복 검사용(대소문자·공백 무시)
    nicknameKey: { type: String, required: true },
    email: { type: String, trim: true, lowercase: true },
    phone: { type: String, trim: true }, // 숫자만 저장 (예: 01012345678)
    bio: { type: String, default: '', maxlength: 500 },
    avatarUrl: { type: String, default: '' },
    avatarPublicId: { type: String, default: '' },
    // 그림판에서 저장한 펜 색 (예: #ff4f8b)
    savedColors: { type: [String], default: [] },
    role: { type: String, enum: ['user', 'admin'], default: 'user' },
    status: { type: String, enum: ['active', 'suspended'], default: 'active' },
    suspendedReason: { type: String, default: '' },
    // 로그인 시도 제한
    failedLoginCount: { type: Number, default: 0 },
    lockUntil: { type: Date, default: null },
    // 비밀번호 변경 시 증가 → 기존 토큰 무효화
    tokenVersion: { type: Number, default: 0 },
    lastLoginAt: { type: Date },
    // 관리자 부트스트랩으로 생성된 계정 표시
    bootstrapAdmin: { type: Boolean, default: false },
  },
  { timestamps: true, collection: 'users' }
);

userSchema.index({ username: 1 }, { unique: true });
userSchema.index({ nicknameKey: 1 }, { unique: true });
userSchema.index({ email: 1 }, { unique: true, partialFilterExpression: { email: { $type: 'string' } } });
userSchema.index({ phone: 1 }, { unique: true, partialFilterExpression: { phone: { $type: 'string' } } });
userSchema.index({ createdAt: -1 });

userSchema.methods.toPublic = function toPublic() {
  return {
    id: this._id.toString(),
    username: this.username,
    nickname: this.nickname,
    bio: this.bio,
    avatarUrl: this.avatarUrl,
    createdAt: this.createdAt,
  };
};

userSchema.methods.toSelf = function toSelf() {
  return {
    ...this.toPublic(),
    email: this.email || '',
    phone: this.phone || '',
    role: this.role,
    isAdmin: this.role === 'admin',
    status: this.status,
  };
};

export function nicknameKeyOf(nickname) {
  return String(nickname || '').normalize('NFC').replace(/\s+/g, '').toLowerCase();
}

export const User = mongoose.models.User || mongoose.model('User', userSchema);
