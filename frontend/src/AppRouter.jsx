// Purpose: 앱 전체 라우팅 설정 — URL별 페이지 컴포넌트 연결
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import App from './App'; // 기존 날씨 지도 컴포넌트
import ErrorPage from './pages/ErrorPage';
import ErrorTest from './pages/ErrorTest';
import BinancePage from './pages/BinancePage';

function AppRouter() {
    return (
        <Router>
            <Routes>
                {/* Binance 페이지 */}
                <Route path="/" element={<BinancePage />} />

                {/* Cesium 페이지 */}
                <Route path="/app" element={<App />} />

                {/* 에러 페이지 — ?code= 파라미터로 4xx/5xx 분기 */}
                <Route path="/error" element={<ErrorPage />} />

                {/* 에러 페이지 테스트 (개발 환경에서만 노출) */}
                {import.meta.env.DEV && <Route path="/error-test" element={<ErrorTest />} />}

                {/* 그 외 모든 잘못된 주소는 404 에러 페이지로 연결 */}
                <Route path="*" element={<Navigate to="/error?code=404" replace />} />
            </Routes>
        </Router>
    );
}

export default AppRouter;