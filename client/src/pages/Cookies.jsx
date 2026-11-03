import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, qs } from '../lib/api.js';
import { fmtDate } from '../lib/format.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { Pager, Spinner } from '../components/ui.jsx';

const TX_LABEL = { signup: '가입 축하', reward: '활동 보상', spend: '사용', receive: '선물 수령', admin_adjust: '관리자 조정', refund: '환불' };

function AttendanceCalendar({ days, month }) {
  const [y, m] = month.split('-').map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  const count = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const set = new Map(days.map((d) => [Number(d.day.slice(8)), d]));
  const cells = [...Array(first).fill(null), ...Array.from({ length: count }, (_, i) => i + 1)];
  return (
    <div className="att-cal" aria-label={`${m}월 출석 달력`}>
      {['일', '월', '화', '수', '목', '금', '토'].map((d) => <span key={d} className="att-dow">{d}</span>)}
      {cells.map((d, i) => (
        <span key={i} className={`att-day ${d && set.has(d) ? 'on' : ''}`} title={d && set.has(d) ? `${set.get(d).streak}일 연속 · +${set.get(d).reward}` : ''}>{d || ''}</span>
      ))}
    </div>
  );
}

export default function Cookies() {
  const { refresh, user } = useAuth();
  const toast = useToast();
  const [summary, setSummary] = useState(null);
  const [rules, setRules] = useState(null);
  const [att, setAtt] = useState(null);
  const [tx, setTx] = useState(null);
  const [type, setType] = useState('all');
  const [page, setPage] = useState(1);

  const loadSummary = useCallback(() => Promise.all([
    api.get('/cookies/summary').then(setSummary),
    api.get('/cookies/attendance').then(setAtt),
  ]).catch((e) => toast.error(e)), [toast]);
  useEffect(() => { loadSummary(); api.get('/cookies/rules').then(setRules).catch(() => {}); }, [loadSummary]);
  useEffect(() => { api.get(`/cookies/transactions${qs({ type: type === 'all' ? '' : type, page })}`).then(setTx).catch((e) => toast.error(e)); }, [type, page, toast, summary]);

  async function checkIn() {
    try {
      const r = await api.post('/cookies/attendance');
      toast.cookie(r.reward ? `출석 완료! ${r.streak}일 연속 출석으로 쿠키 ${r.reward}개를 받았어요.` : '출석 완료!');
      await Promise.all([loadSummary(), refresh()]);
    } catch (e) { toast.error(e); }
  }

  if (!summary) return <Spinner />;
  const w = summary.wallet;
  return (
    <div className="page">
      <div className="page-head"><h1>쿠키</h1></div>
      <div className="cookie-top">
        <section className="cookie-balance">
          <span className="cookie-big" aria-hidden="true" />
          <div>
            <p className="muted">보유 쿠키</p>
            <strong>{w.unlimited ? '무제한' : `${w.balance.toLocaleString()}개`}</strong>
            <p className="muted small">누적 획득 {w.totalEarned.toLocaleString()} · 선물 수령 {w.totalReceived.toLocaleString()} · 사용 {w.totalSpent.toLocaleString()}</p>
          </div>
        </section>
        <section className="panel att-panel">
          <div className="att-head">
            <div>
              <h2>출석체크</h2>
              <p className="muted small">{summary.attendance.checkedToday ? `오늘 출석 완료 · ${summary.attendance.streak}일 연속` : '오늘 아직 출석하지 않았어요.'}</p>
            </div>
            <button type="button" className="btn btn-primary" onClick={checkIn} disabled={summary.attendance.checkedToday}>{summary.attendance.checkedToday ? '출석 완료' : '출석하기'}</button>
          </div>
          {att && <AttendanceCalendar days={att.days} month={att.month} />}
        </section>
      </div>

      {rules && (
        <section className="panel">
          <h2>쿠키 모으는 방법</h2>
          <ul className="rule-list">
            <li><span>회원가입</span><strong>+{rules.signupBonus}</strong><em>처음 한 번</em></li>
            <li><span>출석체크</span><strong>+{rules.attendance.amount}</strong><em>{rules.attendance.desc}</em></li>
            {rules.rewards.map((r) => <li key={r.type}><span>{r.label}</span><strong>+{r.amount}</strong><em>{r.desc}</em></li>)}
          </ul>
          <p className="muted small">같은 작품에 대한 보상은 한 번만 받을 수 있고, 활동마다 하루 한도가 있어요. 하루는 한국 시간 자정에 바뀌어요. 쿠키 {rules.previewPrice}개로 공개 예정인 회차를 미리 볼 수 있어요.</p>
          {user?.isAdmin && <p className="notice">관리자 계정은 쿠키가 무제한이라 활동 보상이 지급되지 않아요.</p>}
        </section>
      )}

      <section className="panel">
        <div className="section-head">
          <h2>쿠키 내역</h2>
          <div className="seg seg-sm">
            {[['all', '전체'], ['earn', '획득'], ['spend', '사용'], ['receive', '수신']].map(([v, l]) => (
              <button type="button" key={v} className={type === v ? 'on' : ''} onClick={() => { setType(v); setPage(1); }}>{l}</button>
            ))}
          </div>
        </div>
        {!tx ? <Spinner /> : tx.items.length === 0 ? <p className="muted center">내역이 없어요.</p> : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>날짜</th><th>구분</th><th>내용</th><th className="num">변동</th><th className="num">잔액</th></tr></thead>
              <tbody>
                {tx.items.map((t) => (
                  <tr key={t.id}>
                    <td>{fmtDate(t.createdAt, true)}</td>
                    <td><span className={`tx-type tx-${t.amount < 0 ? 'out' : 'in'}`}>{TX_LABEL[t.type] || t.type}</span></td>
                    <td>{t.ref?.kind === 'episode' && t.ref.id ? <Link to={`/episodes/${t.ref.id}`}>{t.reason}</Link> : t.reason}</td>
                    <td className={`num ${t.amount < 0 ? 'neg' : 'pos'}`}>{t.amount > 0 ? `+${t.amount}` : t.amount}</td>
                    <td className="num">{t.balanceAfter ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {tx && <Pager page={tx.page} pages={tx.pages} onPage={setPage} />}
      </section>
    </div>
  );
}
