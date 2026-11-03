import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useToast } from '../context/ToastContext.jsx';
import { Field } from '../components/ui.jsx';

function ChannelPicker({ channels, channel, setChannel }) {
  return (
    <div className="seg" role="radiogroup" aria-label="인증 방법">
      <button type="button" role="radio" aria-checked={channel === 'email'} className={channel === 'email' ? 'on' : ''} disabled={!channels.email} onClick={() => setChannel('email')}>이메일로 인증</button>
      <button type="button" role="radio" aria-checked={channel === 'phone'} className={channel === 'phone' ? 'on' : ''} disabled={!channels.phone} onClick={() => setChannel('phone')}>휴대폰으로 인증</button>
    </div>
  );
}

export default function FindAccount() {
  const [sp, setSp] = useSearchParams();
  const tab = sp.get('tab') === 'password' ? 'password' : 'id';
  const toast = useToast();
  const nav = useNavigate();
  const [channels, setChannels] = useState({ email: true, phone: true, devMode: false });
  const [channel, setChannel] = useState('email');
  const [step, setStep] = useState('request'); // request → verify → done/reset
  const [form, setForm] = useState({ username: '', target: '', code: '', pw: '', pw2: '' });
  const [requestId, setRequestId] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [found, setFound] = useState(null);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get('/auth/recovery-channels').then((c) => {
      setChannels(c);
      if (!c.email && c.phone) setChannel('phone');
    }).catch(() => {});
  }, []);
  useEffect(() => { setStep('request'); setError(''); setInfo(''); setFound(null); }, [tab]);

  const run = async (fn) => {
    setBusy(true); setError('');
    try { await fn(); } catch (e) { setError(e.message); } finally { setBusy(false); }
  };

  const requestCode = (e) => {
    e.preventDefault();
    run(async () => {
      const url = tab === 'id' ? '/auth/find-id/request' : '/auth/reset/request';
      const body = { channel, target: form.target, ...(tab === 'password' ? { username: form.username } : {}) };
      const r = await api.post(url, body);
      setRequestId(r.requestId);
      setInfo(`${r.message} (유효시간 ${r.expiresInMin}분)`);
      setStep('verify');
    });
  };

  const verify = (e) => {
    e.preventDefault();
    run(async () => {
      if (tab === 'id') {
        setFound(await api.post('/auth/find-id/verify', { requestId, code: form.code }));
        setStep('done');
      } else {
        const r = await api.post('/auth/reset/verify', { requestId, code: form.code });
        setResetToken(r.resetToken);
        setStep('reset');
      }
    });
  };

  const reset = (e) => {
    e.preventDefault();
    if (form.pw !== form.pw2) { setError('비밀번호가 일치하지 않아요.'); return; }
    run(async () => {
      const r = await api.post('/auth/reset/complete', { requestId, resetToken, newPassword: form.pw });
      toast.success(r.message);
      nav('/login');
    });
  };

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  return (
    <div className="auth-page">
      <div className="auth-card auth-card-wide">
        <div className="tabs">
          <button type="button" className={tab === 'id' ? 'on' : ''} onClick={() => setSp({})}>아이디 찾기</button>
          <button type="button" className={tab === 'password' ? 'on' : ''} onClick={() => setSp({ tab: 'password' })}>비밀번호 찾기</button>
        </div>
        <p className="notice">가입할 때 이메일 또는 전화번호를 등록한 계정만 찾을 수 있어요. 등록한 연락처로 6자리 인증번호를 보내 본인을 확인합니다.</p>
        {channels.devMode && <p className="notice notice-warn">개발 모드: 메일/문자 발송 서비스가 설정되지 않아 인증번호가 서버 콘솔에 출력됩니다.</p>}

        {step === 'request' && (
          <form onSubmit={requestCode} noValidate>
            <ChannelPicker channels={channels} channel={channel} setChannel={setChannel} />
            {tab === 'password' && (
              <Field label="아이디" htmlFor="f-u"><input id="f-u" className="input" value={form.username} onChange={set('username')} autoComplete="username" /></Field>
            )}
            <Field label={channel === 'email' ? '가입한 이메일' : '가입한 전화번호'} htmlFor="f-t">
              <input id="f-t" className="input" type={channel === 'email' ? 'email' : 'tel'} value={form.target} onChange={set('target')} placeholder={channel === 'email' ? 'name@example.com' : '010-1234-5678'} />
            </Field>
            {error && <p className="form-error">{error}</p>}
            <button type="submit" className="btn btn-primary btn-block" disabled={busy || !form.target || (tab === 'password' && !form.username)}>인증번호 받기</button>
          </form>
        )}

        {step === 'verify' && (
          <form onSubmit={verify} noValidate>
            {info && <p className="notice">{info}</p>}
            <Field label="인증번호 6자리" htmlFor="f-c">
              <input id="f-c" className="input code-input" inputMode="numeric" maxLength={6} value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.replace(/\D/g, '') })} autoComplete="one-time-code" />
            </Field>
            {error && <p className="form-error">{error}</p>}
            <button type="submit" className="btn btn-primary btn-block" disabled={busy || form.code.length !== 6}>확인</button>
            <button type="button" className="btn btn-ghost btn-block" onClick={() => setStep('request')}>인증번호 다시 받기</button>
          </form>
        )}

        {step === 'done' && found && (
          <div className="found-box">
            <p>회원님의 아이디는</p>
            <strong className="found-id">{found.username}</strong>
            <Link to="/login" className="btn btn-primary btn-block">로그인하기</Link>
            <button type="button" className="btn btn-ghost btn-block" onClick={() => setSp({ tab: 'password' })}>비밀번호도 잊으셨나요?</button>
          </div>
        )}

        {step === 'reset' && (
          <form onSubmit={reset} noValidate>
            <Field label="새 비밀번호" htmlFor="f-p" hint="영문+숫자 포함 8자 이상"><input id="f-p" type="password" className="input" autoComplete="new-password" value={form.pw} onChange={set('pw')} /></Field>
            <Field label="새 비밀번호 확인" htmlFor="f-p2"><input id="f-p2" type="password" className="input" autoComplete="new-password" value={form.pw2} onChange={set('pw2')} /></Field>
            {error && <p className="form-error">{error}</p>}
            <button type="submit" className="btn btn-primary btn-block" disabled={busy}>비밀번호 변경</button>
          </form>
        )}
      </div>
    </div>
  );
}
