import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { api, qs } from '../lib/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { LogoMark } from '../components/Logo.jsx';
import { Field } from '../components/ui.jsx';

const USERNAME_RE = /^[a-z0-9_]{4,20}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;
const PHONE_RE = /^0\d{8,10}$/;

function validate(f) {
  const e = {};
  const u = f.username.trim().toLowerCase();
  if (!u) e.username = '아이디를 입력해 주세요.';
  else if (!USERNAME_RE.test(u)) e.username = '영문 소문자·숫자·밑줄(_) 4~20자로 입력해 주세요.';
  if (!f.password) e.password = '비밀번호를 입력해 주세요.';
  else if (f.password.length < 8 || f.password.length > 64) e.password = '비밀번호는 8~64자로 입력해 주세요.';
  else if (!/[A-Za-z]/.test(f.password) || !/\d/.test(f.password)) e.password = '영문자와 숫자를 모두 포함해 주세요.';
  else if (/\s/.test(f.password)) e.password = '공백은 사용할 수 없어요.';
  else if (u && f.password.toLowerCase().includes(u)) e.password = '비밀번호에 아이디를 넣을 수 없어요.';
  if (f.password2 !== f.password) e.password2 = '비밀번호가 일치하지 않아요.';
  const n = f.nickname.trim();
  if (!n) e.nickname = '닉네임을 입력해 주세요.';
  else if (n.length < 2 || n.length > 16) e.nickname = '닉네임은 2~16자로 입력해 주세요.';
  if (f.email && !EMAIL_RE.test(f.email.trim())) e.email = '이메일 형식이 올바르지 않아요.';
  if (f.phone && !PHONE_RE.test(f.phone.replace(/[\s-]/g, ''))) e.phone = '예: 010-1234-5678';
  return e;
}

function useAvailability(kind, value, valid) {
  const [state, setState] = useState(null);
  useEffect(() => {
    if (!value || !valid) { setState(null); return undefined; }
    const t = setTimeout(async () => {
      try {
        setState(await api.get(`/auth/check-${kind}${qs({ [kind]: value })}`));
      } catch { setState(null); }
    }, 400);
    return () => clearTimeout(t);
  }, [kind, value, valid]);
  return state;
}

export default function Register() {
  const { user, register } = useAuth();
  const toast = useToast();
  const nav = useNavigate();
  const [f, setF] = useState({ username: '', password: '', password2: '', nickname: '', email: '', phone: '' });
  const [touched, setTouched] = useState({});
  const [serverError, setServerError] = useState('');
  const [busy, setBusy] = useState(false);
  const errors = validate(f);
  const uAvail = useAvailability('username', f.username.trim().toLowerCase(), !errors.username);
  const nAvail = useAvailability('nickname', f.nickname.trim(), !errors.nickname);

  if (user) return <Navigate to="/" replace />;

  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const blur = (k) => () => setTouched({ ...touched, [k]: true });
  const err = (k) => (touched[k] ? errors[k] : '');

  async function submit(e) {
    e.preventDefault();
    setTouched({ username: 1, password: 1, password2: 1, nickname: 1, email: 1, phone: 1 });
    setServerError('');
    if (Object.keys(errors).length) return;
    if (uAvail && !uAvail.available) return;
    if (nAvail && !nAvail.available) return;
    setBusy(true);
    try {
      const r = await register({ username: f.username, password: f.password, nickname: f.nickname, email: f.email, phone: f.phone });
      toast.cookie(r.message);
      nav('/', { replace: true });
    } catch (ex) {
      setServerError(ex.message);
    } finally {
      setBusy(false);
    }
  }

  const noRecovery = !f.email.trim() && !f.phone.trim();

  return (
    <div className="auth-page">
      <form className="auth-card auth-card-wide" onSubmit={submit} noValidate>
        <LogoMark size={52} />
        <h1>회원가입</h1>
        <p className="muted center">가입하면 쿠키 10개를 바로 드려요.</p>

        <Field label="아이디 *" htmlFor="r-u" error={err('username') || (uAvail && !uAvail.available ? uAvail.message : '')} hint={uAvail?.available ? '✓ 사용 가능한 아이디예요.' : '영문 소문자·숫자·밑줄 4~20자'}>
          <input id="r-u" className="input" autoComplete="username" value={f.username} onChange={set('username')} onBlur={blur('username')} />
        </Field>
        <Field label="비밀번호 *" htmlFor="r-p" error={err('password')} hint="영문+숫자 포함 8자 이상">
          <input id="r-p" type="password" className="input" autoComplete="new-password" value={f.password} onChange={set('password')} onBlur={blur('password')} />
        </Field>
        <Field label="비밀번호 확인 *" htmlFor="r-p2" error={err('password2')}>
          <input id="r-p2" type="password" className="input" autoComplete="new-password" value={f.password2} onChange={set('password2')} onBlur={blur('password2')} />
        </Field>
        <Field label="닉네임 *" htmlFor="r-n" error={err('nickname') || (nAvail && !nAvail.available ? nAvail.message : '')} hint={nAvail?.available ? '✓ 사용 가능한 닉네임이에요.' : '2~16자, 작품에 표시되는 이름'}>
          <input id="r-n" className="input" value={f.nickname} onChange={set('nickname')} onBlur={blur('nickname')} />
        </Field>
        <div className="grid-2">
          <Field label="이메일 (선택)" htmlFor="r-e" error={err('email')}>
            <input id="r-e" type="email" className="input" autoComplete="email" value={f.email} onChange={set('email')} onBlur={blur('email')} />
          </Field>
          <Field label="전화번호 (선택)" htmlFor="r-ph" error={err('phone')}>
            <input id="r-ph" type="tel" className="input" autoComplete="tel" placeholder="010-1234-5678" value={f.phone} onChange={set('phone')} onBlur={blur('phone')} />
          </Field>
        </div>
        <p className={`notice ${noRecovery ? 'notice-warn' : ''}`}>
          이메일과 전화번호는 선택 사항이에요. 둘 다 입력하지 않으면 나중에 <strong>아이디 찾기·비밀번호 찾기를 이용할 수 없어요.</strong>
        </p>
        {serverError && <p className="form-error" role="alert">{serverError}</p>}
        <button type="submit" className="btn btn-primary btn-block btn-lg" disabled={busy}>{busy ? '가입 중…' : '가입하기'}</button>
        <div className="auth-links"><span>이미 계정이 있나요?</span><Link to="/login">로그인</Link></div>
      </form>
    </div>
  );
}
