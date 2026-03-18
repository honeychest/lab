// [AGENT] T4-ANALYSIS: /analysis 라우트 추가 (AnalysisPage)
// [AGENT] 앱 라우팅 — BrowserRouter 기반
// / → /trade 리다이렉트, /trade(TradePage), /binance(BinancePage), /cesium(CesiumPage), /analysis(AnalysisPage)
// 연관: TradePage.jsx, BinancePage.jsx, CesiumPage.jsx, AnalysisPage.jsx, ErrorPage.tsx
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';

import CesiumPage    from '../../page/weather/CesiumPage.jsx';
import ErrorPage     from '../../page/error/ErrorPage.tsx';
import ErrorTest     from '../../page/error/ErrorTest.tsx';
import TestTest      from '../../page/error/TestTest.jsx';
import BinancePage   from '../../page/binance/BinancePage.jsx';
import TradePage     from '../../page/trade/TradePage.jsx';
import SignalPage    from '../../page/signal/SignalPage.jsx';
import AdminPage     from '../../page/admin/AdminPage.jsx';
import AnalysisPage  from '../../page/analysis/AnalysisPage.jsx';
import MonitorPage   from '../../page/monitor/MonitorPage.jsx';
import ForbiddenPage from '../../page/forbidden/ForbiddenPage.jsx';

function MainRouter() {
    return (
        <Router>
            <Routes>
                {/* 초기 접속: /trade로 리다이렉트 */}
                <Route path="/" element={<Navigate to="/trade" replace />} />

                {/* Trade 페이지 */}
                <Route path="/trade" element={<TradePage />} />

                {/* Binance 페이지 (경로 변경: / → /binance) */}
                <Route path="/binance" element={<BinancePage />} />

                {/* Signal 페이지 */}
                <Route path="/signal" element={<SignalPage />} />

                {/* Analysis 페이지 */}
                <Route path="/analysis" element={<AnalysisPage />} />

                {/* Cesium 페이지 */}
                <Route path="/cesium" element={<CesiumPage />} />

                {/* Admin 페이지 */}
                <Route path="/admin" element={<AdminPage />} />

                {/* Monitor 페이지 */}
                <Route path="/monitor" element={<MonitorPage />} />

                {/* Forbidden 페이지 (GNB/Footer 없이 단독) */}
                <Route path="/forbidden" element={<ForbiddenPage />} />

                {/* 기존 /app 경로 호환 */}
                <Route path="/app" element={<Navigate to="/cesium" replace />} />

                <Route path="/test" element={<TestTest />} />

                {import.meta.env.DEV && <Route path="/error-test" element={<ErrorTest />} />}

                <Route path="*" element={<ErrorPage code="404" />} />
            </Routes>
        </Router>
    );
}

export default MainRouter;
