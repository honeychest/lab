// Purpose: 앱 전체 상단 헤더 - 브랜드(Home), 메뉴 네비게이션, Docker 서버 인디케이터

import { NavLink } from 'react-router-dom';
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
 * @param {string|null|undefined} serverName
 *   - undefined : 이 페이지에서 서버 정보를 전달하지 않음 → 배지 영역 자체를 숨김
 *   - null      : 전달은 했으나 API 응답 전 (로딩 중) → 둘 다 꺼진 상태로 표시
 *   - 'docker1' / 'docker2' : 해당 배지 점등
 */
function Header({ serverName }) {
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
              serverName이 undefined(미전달)이면 영역 자체를 렌더하지 않음.
              null(로딩 중)이면 두 배지 모두 꺼진 상태로 표시.
              'docker1'/'docker2'이면 해당 배지만 점등.
            ──────────────────────────────────────────────────── */}
            {serverName !== undefined && (
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
            )}
        </header>
    );
}

export default Header;
