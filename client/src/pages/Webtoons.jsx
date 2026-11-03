import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, qs } from '../lib/api.js';
import { GENRES } from '../lib/format.js';
import { Empty, Icon, Pager, Spinner, WebtoonCard } from '../components/ui.jsx';

const SORTS = [
  { v: 'popular', l: '인기순' },
  { v: 'latest', l: '최신순' },
  { v: 'views', l: '조회수순' },
  { v: 'updated', l: '업데이트순' },
];

export default function Webtoons() {
  const [sp, setSp] = useSearchParams();
  const genre = sp.get('genre') || '';
  const sort = sp.get('sort') || 'popular';
  const q = sp.get('q') || '';
  const author = sp.get('author') || '';
  const page = Number(sp.get('page')) || 1;
  const [mode, setMode] = useState(author ? 'author' : 'title');
  const [term, setTerm] = useState(author || q);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    setData(null);
    api.get(`/webtoons${qs({ genre, sort, q, author, page })}`).then(setData).catch((e) => setError(e.message));
  }, [genre, sort, q, author, page]);

  const update = (patch) => {
    const next = { genre, sort, q, author, ...patch };
    if (!('page' in patch)) next.page = '';
    Object.keys(next).forEach((k) => { if (!next[k] || next[k] === 1) delete next[k]; });
    setSp(next);
  };

  const search = (e) => {
    e.preventDefault();
    update(mode === 'title' ? { q: term.trim(), author: '' } : { author: term.trim(), q: '' });
  };

  return (
    <div className="page">
      <div className="page-head">
        <h1>웹툰</h1>
        <form className="searchbar" onSubmit={search} role="search">
          <select value={mode} onChange={(e) => setMode(e.target.value)} aria-label="검색 기준">
            <option value="title">제목</option>
            <option value="author">작가</option>
          </select>
          <input value={term} onChange={(e) => setTerm(e.target.value)} placeholder={mode === 'title' ? '웹툰 제목 검색' : '작가 닉네임 검색'} aria-label="검색어" />
          <button type="submit" aria-label="검색"><Icon name="search" /></button>
        </form>
      </div>

      <div className="chips" role="tablist" aria-label="장르">
        <button type="button" className={!genre ? 'on' : ''} onClick={() => update({ genre: '' })}>전체</button>
        {GENRES.map((g) => (
          <button type="button" key={g} className={genre === g ? 'on' : ''} onClick={() => update({ genre: g })}>{g}</button>
        ))}
      </div>

      <div className="list-tools">
        <span className="muted">{data ? `${data.total.toLocaleString()}개 작품` : ''}{(q || author) && ` · "${q || author}" 검색 결과`}</span>
        <div className="seg seg-sm">
          {SORTS.map((s) => <button type="button" key={s.v} className={sort === s.v ? 'on' : ''} onClick={() => update({ sort: s.v })}>{s.l}</button>)}
        </div>
      </div>

      {error && <p className="form-error">{error}</p>}
      {!data && !error && <Spinner />}
      {data && data.items.length === 0 && <Empty title="조건에 맞는 웹툰이 없어요">다른 장르나 검색어로 찾아보세요.</Empty>}
      {data && data.items.length > 0 && <div className="grid-cards">{data.items.map((w) => <WebtoonCard key={w.id} w={w} />)}</div>}
      {data && <Pager page={data.page} pages={data.pages} onPage={(p) => update({ page: p })} />}
    </div>
  );
}
