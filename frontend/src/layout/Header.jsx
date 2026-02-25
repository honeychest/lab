// Purpose: 앱 전체 상단 헤더 - 브랜드(Home)와 메뉴 네비게이션
import { NavLink } from 'react-router-dom';
import styles from './Header.module.css';

const NAV_ITEMS = [
    { label: 'Cesium', path: '/' },
    { label: 'Binance', path: '/binance' },
];

function Header() {
    return (
        <header className={styles.header}>
            <NavLink to="/" className={styles.brand}>Home</NavLink>
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
        </header>
    );
}

export default Header;