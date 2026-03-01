// Purpose: 공통 레이아웃 래퍼 — Header, 메인 콘텐츠 영역, Footer 조합
import Header from "./Header.jsx";
import Footer from "./Footer.jsx";
import styles from './Layout.module.css';

/**
 * @param {React.ReactNode} children   - 페이지 본문
 * @param {string[]}        footerCenter - 하단 기술 태그 목록
 * @param {string|null}     serverName   - Docker 서버 식별자 (null이면 배지 비활성, 미전달 시 undefined)
 */
function Layout({ children, footerCenter = [], serverName }) {
  return (
    <div className={styles.layout}>
      <Header serverName={serverName} />
      <main className={styles.main}>
        {/* 메인 컨텐츠 영역 (페이지 본문이 들어감) */}
        {children}
      </main>
      <Footer centerTech={footerCenter} />
    </div>
  );
}

export default Layout;
