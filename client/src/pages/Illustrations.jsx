import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, qs } from '../lib/api.js';
import { Empty, IllustCard, Icon, Pager, Spinner } from '../components/ui.jsx';

export default function Illustrations() {
  const [sp, setSp] = useSearchParams();
  const sort = sp.get('sort') || 'latest';
  const q = sp.get('q') || '';
  const author = sp.get('author') || '';
  const page = Number(sp.get('page')) || 1;
  const [mode, setMode] = useState(author ? 'author' : 'title');
  const [term, setTerm] = useState(author || q);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    setData(null);
    api.get(`/illustrations${qs({ sort, q, author, page })}`).then(setData).catch((e) => setError(e.message));
  }, [sort, q, author, page]);

  const update = (patch) => {
    const next = { sort, q, author, ...patch };
    if (!('page' in patch)) next.page = '';
    Object.keys(next).forEach((k) => { if (!next[k] || next[k] === 1) delete next[k]; });
    setSp(next);
  };

  return (
    <div className="page">
      <div className="page-head">
        <h1>그림</h1>
        <form className="searchbar" role="search" onSubmit={(e) => { e.preventDefault(); update(mode === 'title' ? { q: term.trim(), author: '' } : { author: term.trim(), q: '' }); }}>
          <select value={mode} onChange={(e) => setMode(e.target.value)} aria-label="검색 기준">
            <option value="title">제목·태그</option>
            <option value="author">작가</option>
          </select>
          <input value={term} onChange={(e) => setTerm(e.target.value)} placeholder={mode === 'title' ? '그림 제목이나 태그' : '작가 닉네임'} aria-label="검색어" />
          <button type="submit" aria-label="검색"><Icon name="search" /></button>
        </form>
      </div>
      <div className="list-tools">
        <span className="muted">{data ? `${data.total.toLocaleString()}점` : ''}{(q || author) && ` · "${q || author}" 검색 결과`}</span>
        <div className="seg seg-sm">
          <button type="button" className={sort === 'latest' ? 'on' : ''} onClick={() => update({ sort: 'latest' })}>최신 그림</button>
          <button type="button" className={sort === 'popular' ? 'on' : ''} onClick={() => update({ sort: 'popular' })}>인기 그림</button>
          <button type="button" className={sort === 'views' ? 'on' : ''} onClick={() => update({ sort: 'views' })}>조회수순</button>
        </div>
      </div>
      {error && <p className="form-error">{error}</p>}
      {!data && !error && <Spinner />}
      {data && data.items.length === 0 && <Empty title="조건에 맞는 그림이 없어요">다른 검색어로 찾아보세요.</Empty>}
      {data && data.items.length > 0 && <div className="masonry">{data.items.map((i) => <IllustCard key={i.id} i={i} />)}</div>}
      {data && <Pager page={data.page} pages={data.pages} onPage={(p) => update({ page: p })} />}
    </div>
  );
}
