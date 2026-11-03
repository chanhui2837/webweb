import { createContext, useCallback, useContext, useMemo, useState } from 'react';

const ToastCtx = createContext(null);
let seq = 0;

export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const remove = useCallback((id) => setItems((xs) => xs.filter((x) => x.id !== id)), []);
  const push = useCallback((message, type = 'info', ms = 3200) => {
    if (!message) return;
    const id = ++seq;
    setItems((xs) => [...xs.slice(-3), { id, message, type }]);
    setTimeout(() => remove(id), ms);
  }, [remove]);

  const api = useMemo(() => ({
    info: (m) => push(m, 'info'),
    success: (m) => push(m, 'success'),
    error: (m) => push(m?.message || m, 'error', 4500),
    cookie: (m) => push(m, 'cookie', 4000),
    /** 서버 응답의 reward 객체를 토스트로 */
    reward: (r) => r && push(`🍪 ${r.label} 보상으로 쿠키 ${r.amount}개를 받았어요!`, 'cookie', 4000),
  }), [push]);

  return (
    <ToastCtx.Provider value={api}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {items.map((t) => (
          <button type="button" key={t.id} className={`toast toast-${t.type}`} onClick={() => remove(t.id)}>
            {t.message}
          </button>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export const useToast = () => useContext(ToastCtx);
