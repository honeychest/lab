// [AGENT] 앱 라우팅 — BrowserRouter 기반, /app→/cesium 리다이렉트, DEV 전용 /error-test
// 연관: BinancePage.jsx, CesiumPage.jsx, ErrorPage.tsx
// Purpose: 앱 전체 라우팅 설정 — URL별 페이지 컴포넌트 연결
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'; // Navigate: /app → /cesium 리다이렉트에 사용

import CesiumPage from '../../page/weather/CesiumPage.jsx';
import ErrorPage from '../../page/error/ErrorPage.tsx';
import ErrorTest from '../../page/error/ErrorTest.tsx';
import TestTest from '../../page/error/TestTest.jsx';
import BinancePage from '../../page/binance/BinancePage.jsx';

function MainRouter() {
    return (
        <Router>
            <Routes>
                {/* Binance 페이지 */}
                <Route path="/" element={<BinancePage />} />

                {/* Cesium 페이지 */}
                <Route path="/cesium" element={<CesiumPage />} />

                {/* 기존 /app 경로 호환: /cesium으로 리다이렉트 */}
                <Route path="/app" element={<Navigate to="/cesium" replace />} />


                <Route path="/test" element={<TestTest />} />

                {/* 에러 페이지 테스트 (개발 환경에서만 노출) */}
                {import.meta.env.DEV && <Route path="/error-test" element={<ErrorTest />} />}

                {/* 그 외 모든 잘못된 주소는 404 에러 페이지 직접 렌더 (URL 변경 없음) */}
                <Route path="*" element={<ErrorPage code="404" />} />
            </Routes>
        </Router>
    );
}

export default MainRouter;
