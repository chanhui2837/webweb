import { useState } from 'react';
import { api } from '../lib/api.js';
import { useToast } from '../context/ToastContext.jsx';
import { Icon, Modal } from './ui.jsx';

const REASONS = ['선정적이거나 폭력적인 내용', '욕설·혐오 표현', '도용·저작권 침해', '스팸·광고', '기타'];

export default function ReportButton({ targetType, targetId, compact = false }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState(REASONS[0]);
  const [detail, setDetail] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    try {
      const r = await api.post('/reports', { targetType, targetId, reason: detail ? `${reason} — ${detail}` : reason });
      toast.success(r.message);
      setOpen(false);
      setDetail('');
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button type="button" className={compact ? 'icon-btn' : 'btn btn-ghost btn-sm'} onClick={() => setOpen(true)} aria-label="신고">
        <Icon name="flag" size={16} />{!compact && ' 신고'}
      </button>
      <Modal
        open={open}
        title="신고하기"
        onClose={() => setOpen(false)}
        footer={<><button type="button" className="btn" onClick={() => setOpen(false)}>취소</button><button type="button" className="btn btn-danger" disabled={busy} onClick={submit}>신고 접수</button></>}
      >
        <div className="radio-list">
          {REASONS.map((r) => (
            <label key={r}><input type="radio" name="reason" checked={reason === r} onChange={() => setReason(r)} /> {r}</label>
          ))}
        </div>
        <textarea className="input" rows={3} maxLength={300} placeholder="자세한 내용 (선택)" value={detail} onChange={(e) => setDetail(e.target.value)} />
      </Modal>
    </>
  );
}
