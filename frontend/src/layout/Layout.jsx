// Purpose: 공통 레이아웃 래퍼 — Header, 메인 콘텐츠 영역, Footer 조합
import React, { useState } from "react";
import Header from "./Header.jsx";
import Footer from "./Footer.jsx";
import TelegramPopup from "../components/common/TelegramPopup.jsx";
import styles from './Layout.module.css';

/**
 * @param {React.ReactNode} children   - 페이지 본문
 * @param {string[]}        footerCenter - 하단 기술 태그 목록
 */
function Layout({ children, footerCenter = [] }) {
    const [isSupportOpen, setIsSupportOpen] = useState(false);
    return (
        <div className={styles.layout}>
            <Header />
            <TelegramPopup isOpen={isSupportOpen} onClose={() => setIsSupportOpen(false)} />
            <main className={styles.main}>
                {/* 메인 컨텐츠 영역 (페이지 본문이 들어감) */}
                {children}
            </main>
            {/* onAdminClick 프롭스 전달 */}
            <Footer centerTech={footerCenter} onAdminClick={() => setIsSupportOpen(true)} />
        </div>
    );
}

export default Layout;
