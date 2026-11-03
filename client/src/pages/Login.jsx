import { useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { LogoMark } from '../components/Logo.jsx';
import { Field } from '../components/ui.jsx';

function safeNext(n) {
  return n && n.startsWith('/') && !n.startsWith('//') ? n : '/';
}

export default function Login() {
  const { user, login } = useAuth();
  const toast = useToast();
  const nav = useNavigate();
  const [sp] = useSearchParams();
  const [form, setForm] = useState({ username: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to={safeNext(sp.get('next'))} replace />;

  async function submit(e) {
    e.preventDefault();
    setError('');
    if (!form.username || !form.password) { setError('아이디와 비밀번호를 입력해 주세요.'); return; }
    setBusy(true);
    try {
      const r = await login(form.username, form.password);
      toast.success(`${r.user.nickname}님, 반가워요!`);
      nav(safeNext(sp.get('next')), { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-page">
      <form className="auth-card" onSubmit={submit} noValidate>
        <LogoMark size={52} />
        <h1>로그인</h1>
        <Field label="아이디" htmlFor="username">
          <input id="username" className="input" autoComplete="username" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
        </Field>
        <Field label="비밀번호" htmlFor="password">
          <input id="password" type="password" className="input" autoComplete="current-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        </Field>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button type="submit" className="btn btn-primary btn-block btn-lg" disabled={busy}>{busy ? '로그인 중…' : '로그인'}</button>
        <div className="auth-links">
          <Link to="/find-account">아이디 찾기</Link>
          <Link to="/find-account?tab=password">비밀번호 찾기</Link>
          <Link to="/register">회원가입</Link>
        </div>
      </form>
    </div>
  );
}
