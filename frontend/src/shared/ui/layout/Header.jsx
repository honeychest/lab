// [AGENT] 앱 상단 헤더 — NavLink 메뉴 3탭(Trade/Binance/Cesium), X-Server-Name 서버 인디케이터
// 연관: Layout.jsx, MainRouter.jsx
// Purpose: 앱 전체 상단 헤더 - 메뉴 네비게이션, 서버 인디케이터

import { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import axios from 'axios';
import styles from './Header.module.css';

const NAV_ITEMS = [
    { label: 'Binance', path: '/binance' },
    { label: 'Trade',   path: '/trade' },
    { label: 'Signal',  path: '/signal' },
    { label: 'Cesium',  path: '/cesium' },
];

/**
 * Header 컴포넌트
 *
 * 마운트 시 /api/binance/price 를 1회 호출해 응답 헤더 X-Server-Name 을 읽는다.
 *
 * serverName 상태:
 *   null     = API 응답 전 (로딩 중) — 인디케이터 미표시
 *   'DOCKER1' 등 = 서버 환경변수 SERVER_NAME 값 그대로 표시
 *   'LOCAL'  = 환경변수 미설정 (로컬 개발) — 백엔드가 기본값으로 내려줌
 */
function Header() {
    const [serverName, setServerName] = useState(null);

    useEffect(() => {
        axios.get('/api/binance/price')
            .then((res) => {
                const sn = res.headers['x-server-name'];
                if (sn) setServerName(sn);
            })
            .catch(() => {});
    }, []);

    return (
        <header className={styles.header}>
            {/* ── 네비게이션 ──────────────────────────────────── */}
            <nav>
                <ul className={styles.nav}>
                    {NAV_ITEMS.map(({ label, path }) => (
                        <li key={path} className={styles.navItem}>
                            <NavLink
                                to={path}
                                end
                                className={({ isActive }) =>
                                    `${styles.navLink} ${isActive ? styles.navLinkActive : ''}`
                                }
                            >
                                {label}
                            </NavLink>
                        </li>
                    ))}
                </ul>
            </nav>

            {/* ── 서버 인디케이터 ──────────────────────────────
              API 응답 전(null)이면 미표시.
              응답 후 X-Server-Name 값을 그대로 표시.
                connected
                DOCKER1
            ──────────────────────────────────────────────── */}
            {serverName && (
                <div className={styles.serverInfo}>
                    <span className={styles.serverConnected}>connected</span>
                    <span className={styles.serverName}>{serverName}</span>
                </div>
            )}
        </header>
    );
}

export default Header;
