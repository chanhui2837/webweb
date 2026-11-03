import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useToast } from '../context/ToastContext.jsx';
import { Empty, IllustCard, Spinner, WebtoonCard } from '../components/ui.jsx';

export default function Library() {
  const [sp, setSp] = useSearchParams();
  const tab = sp.get('tab') === 'illustrations' ? 'illustrations' : 'webtoons';
  const toast = useToast();
  const [data, setData] = useState(null);

  useEffect(() => { api.get('/users/me/saved').then(setData).catch((e) => toast.error(e)); }, [toast]);

  return (
    <div className="page">
      <div className="page-head"><div><h1>관심 작품</h1><p className="muted">관심 등록한 웹툰은 새 회차가 올라오면 알림으로 알려 드려요.</p></div></div>
      <div className="tabs tabs-line">
        <button type="button" className={tab === 'webtoons' ? 'on' : ''} onClick={() => setSp({})}>관심 웹툰 {data && <span className="muted">{data.webtoons.length}</span>}</button>
        <button type="button" className={tab === 'illustrations' ? 'on' : ''} onClick={() => setSp({ tab: 'illustrations' })}>저장한 그림 {data && <span className="muted">{data.illustrations.length}</span>}</button>
      </div>
      {!data && <Spinner />}
      {data && tab === 'webtoons' && (data.webtoons.length
        ? <div className="grid-cards">{data.webtoons.map((w) => <WebtoonCard key={w.id} w={w} />)}</div>
        : <Empty title="관심 웹툰이 없어요" action={<Link className="btn btn-primary" to="/webtoons">웹툰 둘러보기</Link>}>작품 화면에서 ‘관심 등록’을 누르면 여기에 모여요.</Empty>)}
      {data && tab === 'illustrations' && (data.illustrations.length
        ? <div className="masonry">{data.illustrations.map((i) => <IllustCard key={i.id} i={i} />)}</div>
        : <Empty title="저장한 그림이 없어요" action={<Link className="btn btn-primary" to="/illustrations">그림 둘러보기</Link>}>마음에 드는 그림에서 ‘저장’을 눌러 보세요.</Empty>)}
    </div>
  );
}
