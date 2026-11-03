import { Link } from 'react-router-dom';
import { Empty } from '../components/ui.jsx';

export default function NotFound() {
  return (
    <div className="page">
      <Empty title="페이지를 찾을 수 없어요" action={<Link className="btn btn-primary" to="/">홈으로</Link>}>
        주소가 바뀌었거나 삭제된 페이지예요.
      </Empty>
    </div>
  );
}
