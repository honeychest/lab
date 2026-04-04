// [AGENT] Admin 테스트 레이아웃 — 상단 탭 + Outlet 구조
// 새 테스트 추가 시 TEST_TABS 배열에 1줄 추가
import { NavLink, Outlet } from 'react-router-dom';
import Layout from '../../../shared/ui/layout/Layout.jsx';
import '../../../styles/themes/monitor-teal.css';

const TEST_TABS = [
    { label: 'Auth', path: 'auth' },
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

export default function AdminTestLayout() {
    return (
        <Layout footerCenter={['Admin', 'Test']}>
            <div style={layoutStyle}>
                <nav style={tabBarStyle}>
                    {TEST_TABS.map(({ label, path }) => (
                        <NavLink
                            key={path}
                            to={path}
                            end
                            style={({ isActive }) => isActive ? tabActiveStyle : tabStyle}
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
