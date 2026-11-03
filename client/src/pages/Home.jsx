import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { Avatar, Empty, IllustCard, Section, Spinner, WebtoonCard } from '../components/ui.jsx';
import { fmtNum } from '../lib/format.js';

function HeroStrip() {
  // 세 컷짜리 세로 웹툰 스트립 — 웹웹의 상징적인 첫 장면
  return (
    <div className="hero-strip" aria-hidden="true">
      <svg viewBox="0 0 320 420" className="strip-svg">
        <defs>
          <pattern id="tone" width="8" height="8" patternUnits="userSpaceOnUse">
            <circle cx="4" cy="4" r="1.4" fill="var(--ink)" opacity=".22" />
          </pattern>
        </defs>
        {/* 컷 1 */}
        <g className="cut cut-1">
          <rect x="10" y="10" width="300" height="118" rx="4" fill="#fff" stroke="var(--ink)" strokeWidth="3" />
          <rect x="10" y="10" width="300" height="118" rx="4" fill="url(#tone)" />
          <path d="M40 112 Q70 60 110 92 T190 80 T290 104" fill="none" stroke="var(--ink)" strokeWidth="3" strokeLinecap="round" />
          <circle cx="250" cy="44" r="16" fill="var(--marker)" stroke="var(--ink)" strokeWidth="3" />
        </g>
        {/* 컷 2 */}
        <g className="cut cut-2">
          <rect x="10" y="142" width="142" height="130" rx="4" fill="#fff" stroke="var(--ink)" strokeWidth="3" />
          <g stroke="var(--ink)" strokeWidth="1.6" opacity=".55">
            {Array.from({ length: 14 }).map((_, i) => {
              const a = (i / 14) * Math.PI * 2;
              return <line key={i} x1={81 + Math.cos(a) * 26} y1={207 + Math.sin(a) * 26} x2={81 + Math.cos(a) * 80} y2={207 + Math.sin(a) * 80} />;
            })}
          </g>
          <circle cx="81" cy="207" r="22" fill="#fff" stroke="var(--ink)" strokeWidth="3" />
          <circle cx="74" cy="203" r="3" fill="var(--ink)" /><circle cx="89" cy="203" r="3" fill="var(--ink)" />
          <rect x="166" y="142" width="144" height="130" rx="4" fill="var(--cobalt)" stroke="var(--ink)" strokeWidth="3" />
          <path d="M190 236 l18 -50 18 34 18 -46 18 62" fill="none" stroke="#fff" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
        </g>
        {/* 컷 3 + 말풍선 */}
        <g className="cut cut-3">
          <rect x="10" y="286" width="300" height="124" rx="4" fill="#fff" stroke="var(--ink)" strokeWidth="3" />
          <path d="M44 312h190a14 14 0 0 1 14 14v28a14 14 0 0 1-14 14H108l-22 20 4-20H44a14 14 0 0 1-14-14v-28a14 14 0 0 1 14-14z" fill="var(--marker)" stroke="var(--ink)" strokeWidth="3" strokeLinejoin="round" />
          <text x="139" y="347" textAnchor="middle" fontSize="19" fontWeight="800" fill="var(--ink)" fontFamily="Pretendard Variable, Pretendard, sans-serif">다음 화는 내가 그린다!</text>
        </g>
      </svg>
    </div>
  );
}

function Rail({ items }) {
  return (
    <div className="rail">
      {items.map((w) => <WebtoonCard key={w.id} w={w} />)}
    </div>
  );
}

export default function Home() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/home').then(setData).catch((e) => setError(e.message));
  }, [user?.id]);

  const isEmpty = data && !data.popularWebtoons.length && !data.latestIllustrations.length;

  return (
    <div className="page home">
      <section className="hero">
        <div className="hero-copy">
          <h1>그리고, 올리고,<br />이어서 보는 곳.</h1>
          <p>브라우저에서 바로 컷을 나누고 말풍선을 얹어 웹툰을 연재하세요. 다른 작가의 작품에는 댓글과 좋아요로 다음 화를 응원할 수 있어요.</p>
          <div className="hero-actions">
            <Link to={user ? '/projects' : '/register'} className="btn btn-primary btn-lg">{user ? '새 작품 그리기' : '가입하고 쿠키 10개 받기'}</Link>
            <Link to="/webtoons" className="btn btn-lg">웹툰 둘러보기</Link>
          </div>
        </div>
        <HeroStrip />
      </section>

      {error && <p className="form-error">{error}</p>}
      {!data && !error && <Spinner />}
      {isEmpty && (
        <Empty title="아직 공개된 작품이 없어요" action={<Link className="btn btn-primary" to="/projects">첫 작품의 주인공 되기</Link>}>
          웹웹의 첫 웹툰과 그림을 기다리고 있어요.
        </Empty>
      )}

      {data && !isEmpty && (
        <>
          {data.recommendedWebtoons.length > 0 && (
            <Section title={user ? `${user.nickname}님을 위한 추천` : '추천 웹툰'} more="/webtoons"><Rail items={data.recommendedWebtoons} /></Section>
          )}
          {data.popularWebtoons.length > 0 && <Section title="인기 웹툰" more="/webtoons?sort=popular"><Rail items={data.popularWebtoons} /></Section>}
          {data.updatedWebtoons.length > 0 && <Section title="방금 업데이트된 웹툰" more="/webtoons?sort=updated"><Rail items={data.updatedWebtoons} /></Section>}
          {data.latestWebtoons.length > 0 && <Section title="새로 시작한 웹툰" more="/webtoons?sort=latest"><Rail items={data.latestWebtoons} /></Section>}
          {data.popularIllustrations.length > 0 && (
            <Section title="인기 일러스트" more="/illustrations?sort=popular">
              <div className="masonry">{data.popularIllustrations.slice(0, 8).map((i) => <IllustCard key={i.id} i={i} />)}</div>
            </Section>
          )}
          {data.latestIllustrations.length > 0 && (
            <Section title="최신 일러스트" more="/illustrations">
              <div className="masonry">{data.latestIllustrations.slice(0, 8).map((i) => <IllustCard key={i.id} i={i} />)}</div>
            </Section>
          )}
          {data.creators.length > 0 && (
            <Section title="주목할 창작자">
              <div className="creators">
                {data.creators.map((c) => (
                  <Link key={c.id} to={`/u/${c.username}`} className="creator">
                    <Avatar user={c} size={56} />
                    <strong>{c.nickname}</strong>
                    <span>작품 {c.works} · 좋아요 {fmtNum(c.likes)}</span>
                  </Link>
                ))}
              </div>
            </Section>
          )}
        </>
      )}
    </div>
  );
}
