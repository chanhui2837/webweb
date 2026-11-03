import { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router-dom';
import Layout, { RequireAuth } from './components/Layout.jsx';
import { Spinner } from './components/ui.jsx';
import Home from './pages/Home.jsx';
import Login from './pages/Login.jsx';
import Register from './pages/Register.jsx';
import FindAccount from './pages/FindAccount.jsx';
import Webtoons from './pages/Webtoons.jsx';
import WebtoonDetail from './pages/WebtoonDetail.jsx';
import EpisodeReader from './pages/EpisodeReader.jsx';
import Illustrations from './pages/Illustrations.jsx';
import IllustrationDetail from './pages/IllustrationDetail.jsx';
import Projects from './pages/Projects.jsx';
import WebtoonManage from './pages/WebtoonManage.jsx';
import Library from './pages/Library.jsx';
import Inbox from './pages/Inbox.jsx';
import Profile from './pages/Profile.jsx';
import UserPage from './pages/UserPage.jsx';
import Cookies from './pages/Cookies.jsx';
import NotFound from './pages/NotFound.jsx';

// 편집기와 관리자 화면은 필요할 때만 불러온다
const EpisodeEditorPage = lazy(() => import('./pages/EpisodeEditorPage.jsx'));
const IllustrationEditorPage = lazy(() => import('./pages/IllustrationEditorPage.jsx'));
const Admin = lazy(() => import('./pages/Admin.jsx'));

const guard = (el, admin) => <RequireAuth admin={admin}>{el}</RequireAuth>;

export default function App() {
  return (
    <Suspense fallback={<Spinner />}>
      <Routes>
        {/* 편집기는 전체 화면 */}
        <Route path="/projects/episodes/:id" element={guard(<EpisodeEditorPage />)} />
        <Route path="/projects/illustrations/:id" element={guard(<IllustrationEditorPage />)} />
        <Route element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="login" element={<Login />} />
          <Route path="register" element={<Register />} />
          <Route path="find-account" element={<FindAccount />} />
          <Route path="webtoons" element={<Webtoons />} />
          <Route path="webtoons/:id" element={<WebtoonDetail />} />
          <Route path="episodes/:id" element={<EpisodeReader />} />
          <Route path="illustrations" element={<Illustrations />} />
          <Route path="illustrations/:id" element={<IllustrationDetail />} />
          <Route path="projects" element={guard(<Projects />)} />
          <Route path="projects/webtoons/:id" element={guard(<WebtoonManage />)} />
          <Route path="library" element={guard(<Library />)} />
          <Route path="inbox" element={guard(<Inbox />)} />
          <Route path="profile" element={guard(<Profile />)} />
          <Route path="cookies" element={guard(<Cookies />)} />
          <Route path="admin" element={guard(<Admin />, true)} />
          <Route path="u/:username" element={<UserPage />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
