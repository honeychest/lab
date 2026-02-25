import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import App from './App'; // 기존 날씨 지도 컴포넌트
import NotFound from './pages/NotFound';
import ServerError from './pages/ServerError';
import BinancePage from './pages/BinancePage';

function AppRouter() {
    return (
        <Router>
            <Routes>
                {/* 기본 주소일 때 날씨 지도(App)를 보여줌 */}
                <Route path="/" element={<App />} />

                {/* Binance 페이지 (준비 중) */}
                <Route path="/binance" element={<BinancePage />} />

                {/* 500 에러 또는 서버 연결 실패 시 보여줄 페이지 주소 추가 */}
                <Route path="/error" element={<ServerError />} />

                {/* 그 외 모든 잘못된 주소는 NotFound 컴포넌트로 연결 */}
                <Route path="*" element={<NotFound />} />
            </Routes>
        </Router>
    );
}

export default AppRouter;