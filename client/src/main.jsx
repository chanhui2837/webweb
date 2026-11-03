import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import { AuthProvider } from './context/AuthContext.jsx';
import { ToastProvider } from './context/ToastContext.jsx';
import './styles.css';

// 모바일 브라우저는 주소창이 나타났다 사라지며 100vh 가 실제 화면보다 커질 수 있어
// 실제로 보이는 높이를 --app-h 로 넣어 편집기 화면이 위아래로 잘리지 않게 한다.
function setAppHeight() {
  const h = window.visualViewport?.height || window.innerHeight;
  document.documentElement.style.setProperty('--app-h', `${Math.round(h)}px`);
}
setAppHeight();
window.addEventListener('resize', setAppHeight);
window.visualViewport?.addEventListener('resize', setAppHeight);
window.addEventListener('orientationchange', () => setTimeout(setAppHeight, 300));

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <App />
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  </StrictMode>
);
