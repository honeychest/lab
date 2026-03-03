// Purpose: 앱 전체 하단 푸터 - 공통 기술(좌) | 페이지별 기술(중앙) | 브랜드(우)
import styles from './Footer.module.css';

const COMMON_TECH = ['AWS','Linux','Spring Boot','React','MySQL','Nginx'];

// function Footer({ centerTech = [] }) {
function Footer({ centerTech = [], onAdminClick }) {
    return (
        <footer className={styles.footer}>
            {/* 좌측: 공통 기술 스택 */}
            <ul className={styles.techCommon}>
                {COMMON_TECH.map(tech => (
                    <li key={tech} className={styles.techTag}>{tech}</li>
                ))}
            </ul>

            {/* 중앙: 페이지별 기술 스택 */}
            <ul className={styles.techPage}>
                {centerTech.map(tech => (
                    <li key={tech} className={styles.techTagPage}>{tech}</li>
                ))}
            </ul>
            {/* 우측: by CHS */}
            <div className={styles.brandWrapper} onClick={onAdminClick} title="관리자에게 문의하기">
                <span className={styles.brand}>by CHS</span>
            </div>
        </footer>
    );
}

export default Footer;