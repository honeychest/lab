import Header from "./Header.jsx";
import Footer from "./Footer.jsx";
import styles from './Layout.module.css';

function Layout({ children, footerCenter = [] }) {
  return (
    <div className={styles.layout}>
      <Header />
      <main className={styles.main}>
        {/* 메인 컨텐츠 영역 (기존 App 내용이 들어감) */}
        {children}
      </main>
      <Footer centerTech={footerCenter} />
    </div>
  );
}

export default Layout;

