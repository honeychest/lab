// [AGENT] 앱 하단 푸터 — 공통/페이지 기술 태그, by CHS 배지(hasReply 시 빨간 점), onAdminClick 콜백
// 연관: Layout.jsx
// Purpose: 앱 전체 하단 푸터 - 공통 기술(좌) | 페이지별 기술(중앙) | 브랜드(우)
import styles from './Footer.module.css';

const COMMON_TECH = ['AWS','Linux','Spring Boot','Nginx','React','MySQL',];

function Footer({ centerTech = [], onAdminClick, hasReply = false }) {
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
            {/* 우측: by CHS (답변 시 빨간 배지 표시) */}
            <div className={styles.brandWrapper} onClick={onAdminClick} title="관리자에게 문의하기">
                <span className={styles.brand}>by CHS</span>
                {hasReply && <span className={styles.badge} />}
            </div>
        </footer>
    );
}

export default Footer;