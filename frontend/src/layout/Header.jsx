// Purpose: 앱 전체 상단 헤더 - 브랜드(Home), 메뉴 네비게이션, Docker 서버 인디케이터

import { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import axios from 'axios';
import styles from './Header.module.css';

const NAV_ITEMS = [
    { label: 'Binance', path: '/' },
    { label: 'Cesium', path: '/cesium' },
];

/**
 * Docker 서버 인디케이터에 사용할 서버 목록.
 * id: 백엔드 X-Server-Name 헤더값과 매핑되는 식별자
 * label: 화면에 표시할 텍스트
 */
const DOCKER_SERVERS = [
    { id: 'docker1', label: 'DOCKER 1' },
    { id: 'docker2', label: 'DOCKER 2' },
];

/**
 * Header 컴포넌트
 *
 * 마운트 시 /api/binance/price 를 1회 호출해 응답 헤더 X-Server-Name 을 읽는다.
 * 별도 props 없이 자체적으로 서버명을 결정하므로 모든 페이지에서 동작한다.
 *
 * serverName 상태:
 *   null      = API 응답 전 (로딩 중) — 배지 둘 다 꺼진 상태
 *   'docker1' = 8080 컨테이너 처리 — DOCKER 1 점등
 *   'docker2' = 8081 컨테이너 처리 — DOCKER 2 점등
 */
function Header() {
    const [serverName, setServerName] = useState(null);

    useEffect(() => {
        // /api/binance/price: 응답이 가볍고 인증 불필요한 기존 엔드포인트.
        // 서버명 확인이 목적이므로 응답 데이터는 사용하지 않고 헤더만 읽는다.
        // Nginx가 없는 로컬 개발 환경에서는 X-Server-Name 헤더가 없으므로 배지가 꺼진 채 유지됨.
        axios.get('/api/binance/price')
            .then((res) => {
                const sn = res.headers['x-server-name'];
                if (sn) setServerName(sn);
            })
            .catch(() => {
                // 서버 다운 등 실패 시 배지를 표시하지 않음 — 별도 에러 처리 불필요
            });
    }, []); // 마운트 1회만 실행

    return (
        <header className={styles.header}>
            <NavLink to="/" className={styles.brand}>Home</NavLink>

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

            {/* ── Docker 서버 인디케이터 ───────────────────────
              serverName が null(응답 전)이면 배지 둘 다 꺼진 상태.
              'docker1'/'docker2' 수신 시 해당 배지만 점등.
              Nginx 없는 로컬에서는 serverName이 null 유지 → 배지 꺼진 채 표시.
            ──────────────────────────────────────────────────── */}
            <div className={styles.serverBadges}>
                {DOCKER_SERVERS.map(({ id, label }) => {
                    const isActive = serverName === id;
                    return (
                        <div
                            key={id}
                            className={`${styles.serverBadge} ${isActive ? styles.serverBadgeActive : ''}`}
                        >
                            {/* 상태 점: 활성이면 채워진 원, 비활성이면 테두리만 */}
                            <span className={`${styles.serverDot} ${isActive ? styles.serverDotActive : ''}`} />
                            <span className={styles.serverLabel}>{label}</span>
                        </div>
                    );
                })}
            </div>
        </header>
    );
}

export default Header;
