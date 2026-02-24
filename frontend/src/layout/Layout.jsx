import Header from "./Header.jsx";
import Footer from "./Footer.jsx";

function Layout({ children }) {
  return (
    <>
      <Header />
      <main>
        {/* 메인 컨텐츠 영역 (기존 App 내용이 들어감) */}
        {children}
      </main>
      <Footer />
    </>
  );
}

export default Layout;

