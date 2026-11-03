import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../lib/api.js';

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [wallet, setWallet] = useState(null);
  const [loading, setLoading] = useState(true);
  const [unread, setUnread] = useState({ notifications: 0, gifts: 0, total: 0 });
  const timer = useRef(null);

  const refresh = useCallback(async () => {
    try {
      const r = await api.get('/auth/me');
      setUser(r.user);
      setWallet(r.wallet);
      return r.user;
    } catch {
      setUser(null);
      setWallet(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshUnread = useCallback(async () => {
    try {
      setUnread(await api.get('/notifications/unread-count'));
    } catch (e) {
      if (e.status === 401) { setUser(null); setWallet(null); }
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  // 로그인 중에는 30초마다 알림 개수 갱신
  useEffect(() => {
    clearInterval(timer.current);
    if (!user) { setUnread({ notifications: 0, gifts: 0, total: 0 }); return undefined; }
    refreshUnread();
    timer.current = setInterval(refreshUnread, 30000);
    const onFocus = () => refreshUnread();
    window.addEventListener('focus', onFocus);
    return () => { clearInterval(timer.current); window.removeEventListener('focus', onFocus); };
  }, [user, refreshUnread]);

  const value = useMemo(() => ({
    user,
    wallet,
    loading,
    unread,
    isAdmin: !!user?.isAdmin,
    setUser,
    setWallet,
    refresh,
    refreshUnread,
    async login(username, password) {
      const r = await api.post('/auth/login', { username, password });
      setUser(r.user);
      setWallet(r.wallet);
      return r;
    },
    async register(data) {
      const r = await api.post('/auth/register', data);
      setUser(r.user);
      setWallet(r.wallet);
      return r;
    },
    async logout() {
      await api.post('/auth/logout').catch(() => {});
      setUser(null);
      setWallet(null);
    },
  }), [user, wallet, loading, unread, refresh, refreshUnread]);

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export const useAuth = () => useContext(AuthCtx);
