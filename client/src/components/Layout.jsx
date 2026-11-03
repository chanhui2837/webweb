import { useEffect, useState } from 'react';
import { Link, NavLink, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import Logo from './Logo.jsx';
import { Avatar, Icon, Spinner } from './ui.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { fmtNum } from '../lib/format.js';

const MAIN_NAV = [
  { to: '/', label: '홈', icon: 'home', end: true },
  { to: '/webtoons', label: '웹툰', icon: 'book' },
  { to: '/illustrations', label: '그림', icon: 'image' },
  { to: '/projects', label: '프로젝트', icon: 'brush' },
  { to: '/library', label: '관심 작품', icon: 'bookmark' },
];

function CookieChip() {
  const { wallet } = useAuth();
  if (!wallet) return null;
  return (
    <Link to="/cookies" className="cookie-chip" title="내 쿠키">
      <span className="cookie-dot" aria-hidden="true" />
      {wallet.unlimited ? '무제한' : fmtNum(wallet.balance)}
      <span className="sr-only">쿠키</span>
    </Link>
  );
}

function UserMenu() {
  const { user, isAdmin, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const nav = useNavigate();
  const loc = useLocation();
  useEffect(() => setOpen(false), [loc.pathname]);
  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (!e.target.closest('.user-menu')) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);
  return (
    <div className="user-menu">
      <button type="button" className="user-btn" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-label="내 메뉴">
        <Avatar user={user} size={32} />
      </button>
      {open && (
        <div className="dropdown">
          <div className="dropdown-head">
            <strong>{user.nickname}</strong>
            <span>@{user.username}</span>
          </div>
          <Link to="/profile"><Icon name="user" size={16} /> 프로필</Link>
          <Link to={`/u/${user.username}`}><Icon name="eye" size={16} /> 내 공개 페이지</Link>
          <Link to="/cookies"><Icon name="cookie" size={16} /> 쿠키</Link>
          <Link to="/inbox"><Icon name="inbox" size={16} /> 수신함</Link>
          {isAdmin && <Link to="/admin"><Icon name="shield" size={16} /> 관리자</Link>}
          <button type="button" onClick={async () => { await logout(); nav('/'); }}><Icon name="logout" size={16} /> 로그아웃</button>
        </div>
      )}
    </div>
  );
}

function MobileMore({ open, onClose }) {
  const { user, isAdmin, logout, unread } = useAuth();
  const nav = useNavigate();
  if (!open) return null;
  return (
    <div className="sheet-back" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="전체 메뉴">
        {user ? (
          <div className="sheet-user">
            <Avatar user={user} size={44} />
            <div><strong>{user.nickname}</strong><span>@{user.username}</span></div>
            <CookieChip />
          </div>
        ) : (
          <div className="sheet-auth">
            <Link className="btn btn-primary" to="/login" onClick={onClose}>로그인</Link>
            <Link className="btn" to="/register" onClick={onClose}>회원가입</Link>
          </div>
        )}
        <nav className="sheet-links" onClick={onClose}>
          <Link to="/library"><Icon name="bookmark" /> 관심 작품</Link>
          <Link to="/inbox"><Icon name="inbox" /> 수신함 {unread.total > 0 && <span className="badge">{unread.total}</span>}</Link>
          <Link to="/profile"><Icon name="user" /> 프로필</Link>
          <Link to="/cookies"><Icon name="cookie" /> 쿠키</Link>
          {isAdmin && <Link to="/admin"><Icon name="shield" /> 관리자</Link>}
          {user && <button type="button" onClick={async () => { await logout(); nav('/'); }}><Icon name="logout" /> 로그아웃</button>}
        </nav>
      </div>
    </div>
  );
}

export default function Layout() {
  const { user, loading, unread, isAdmin } = useAuth();
  const [more, setMore] = useState(false);
  const loc = useLocation();
  useEffect(() => { window.scrollTo(0, 0); setMore(false); }, [loc.pathname]);

  return (
    <div className="app">
      <a href="#main" className="skip-link">본문으로 건너뛰기</a>
      <header className="topbar">
        <div className="topbar-inner">
          <Link to="/" className="brand" aria-label="웹웹 홈"><Logo /></Link>
          <nav className="main-nav" aria-label="주 메뉴">
            {MAIN_NAV.map((n) => <NavLink key={n.to} to={n.to} end={n.end}>{n.label}</NavLink>)}
            {isAdmin && <NavLink to="/admin" className="nav-admin">관리자</NavLink>}
          </nav>
          <div className="topbar-right">
            {loading ? null : user ? (
              <>
                <CookieChip />
                <Link to="/inbox" className="icon-btn bell" aria-label={`수신함${unread.total ? ` (새 소식 ${unread.total}개)` : ''}`}>
                  <Icon name="bell" size={20} />
                  {unread.total > 0 && <span className="badge">{unread.total > 99 ? '99+' : unread.total}</span>}
                </Link>
                <UserMenu />
              </>
            ) : (
              <>
                <Link to="/login" className="btn btn-ghost">로그인</Link>
                <Link to="/register" className="btn btn-primary hide-sm">회원가입</Link>
              </>
            )}
          </div>
        </div>
      </header>

      <main id="main" className="main">
        <Outlet />
      </main>

      <footer className="footer">
        <Logo size={26} />
        <p>웹웹은 누구나 브라우저에서 웹툰과 그림을 그리고 연재하는 창작 플랫폼입니다.</p>
      </footer>

      <nav className="tabbar" aria-label="하단 메뉴">
        {MAIN_NAV.slice(0, 4).map((n) => (
          <NavLink key={n.to} to={n.to} end={n.end}><Icon name={n.icon} size={22} /><span>{n.label}</span></NavLink>
        ))}
        <button type="button" onClick={() => setMore(true)} className={more ? 'active' : ''}>
          <span className="tab-ico"><Icon name="menu" size={22} />{unread.total > 0 && <span className="dot" />}</span>
          <span>더보기</span>
        </button>
      </nav>
      <MobileMore open={more} onClose={() => setMore(false)} />
    </div>
  );
}

/** 로그인이 필요한 페이지 보호 */
export function RequireAuth({ children, admin = false }) {
  const { user, loading, isAdmin } = useAuth();
  const loc = useLocation();
  if (loading) return <Spinner />;
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(loc.pathname + loc.search)}`} replace />;
  if (admin && !isAdmin) return <Navigate to="/" replace />;
  return children;
}
