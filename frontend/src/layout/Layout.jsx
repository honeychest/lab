// Purpose: 공통 레이아웃 래퍼 — Header, 메인 콘텐츠 영역, Footer 조합
import Header from "./Header.jsx";
import Footer from "./Footer.jsx";
import styles from './Layout.module.css';

/**
 * @param {React.ReactNode} children   - 페이지 본문
 * @param {string[]}        footerCenter - 하단 기술 태그 목록
 */
function Layout({ children, footerCenter = [] }) {
  return (
    <div className={styles.layout}>
      <Header />
      <main className={styles.main}>
        {/* 메인 컨텐츠 영역 (페이지 본문이 들어감) */}
        {children}
      </main>
      <Footer centerTech={footerCenter} />
    </div>
  );
}

export default Layout;
