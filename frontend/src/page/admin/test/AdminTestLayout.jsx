// [AGENT] Admin 테스트 레이아웃 — 접근 가드 + 도메인 탭 + Outlet
// 백엔드가 최종 방어선; 여기서는 UX(로딩·거부·로그인 유도)만 처리
import { useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import apiClient from '@/api/apiClient.js';
import Layout from '../../../shared/ui/layout/Layout.jsx';
import '../../../styles/themes/monitor-teal.css';

const TEST_TABS = [
    { label: 'Auth', path: 'auth' },
    { label: 'Trade', path: 'trade' },
    { label: 'Monitor', path: 'monitor' },
    { label: 'User', path: 'user' },
];

const layoutStyle = {
    minHeight: 'calc(100vh - 120px)',
    padding: '24px',
};

const tabBarStyle = {
    display: 'flex',
    gap: '4px',
    borderBottom: '1px solid rgba(255,255,255,0.12)',
    marginBottom: '24px',
};

const tabStyle = {
    padding: '10px 20px',
    border: '1px solid rgba(255,255,255,0.12)',
    borderBottom: 'none',
    background: 'rgba(0,0,0,0.15)',
    color: 'rgba(255,255,255,0.5)',
    textDecoration: 'none',
    fontSize: '14px',
};

const tabActiveStyle = {
    ...tabStyle,
    background: 'rgba(0, 180, 160, 0.18)',
    color: '#fff',
    borderColor: 'rgba(255,255,255,0.22)',
};

const mutedBox = {
    padding: '24px',
    color: 'rgba(255,255,255,0.7)',
};

export default function AdminTestLayout() {
    const navigate = useNavigate();
    const location = useLocation();
    const [canAccess, setCanAccess] = useState(null);

    useEffect(() => {
        apiClient.get('/api/admin/data-gap/access')
            .then((r) => setCanAccess(r.data.canAccess))
            .catch((e) => {
                if (e?.response?.status === 403) {
                    navigate('/admin/login', { replace: true, state: { from: location.pathname } });
                    return;
                }
                setCanAccess(false);
            });
    }, [navigate, location.pathname]);

    if (canAccess === null) {
        return (
            <Layout footerCenter={['Admin', 'Test']}>
                <div style={{ ...layoutStyle, ...mutedBox }}>접근 권한 확인 중...</div>
            </Layout>
        );
    }

    if (!canAccess) {
        return (
            <Layout footerCenter={['Admin', 'Test']}>
                <div style={{ ...layoutStyle, ...mutedBox }}>접근 권한이 없습니다.</div>
            </Layout>
        );
    }

    return (
        <Layout footerCenter={['Admin', 'Test']}>
            <div style={layoutStyle}>
                <nav style={tabBarStyle}>
                    {TEST_TABS.map(({ label, path }) => (
                        <NavLink
                            key={path}
                            to={path}
                            end
                            style={({ isActive }) => (isActive ? tabActiveStyle : tabStyle)}
                        >
                            {label}
                        </NavLink>
                    ))}
                </nav>
                <Outlet />
            </div>
        </Layout>
    );
}
