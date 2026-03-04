// Purpose: 공통 레이아웃 래퍼 — Header, 메인 콘텐츠 영역, Footer 조합
import React, { useState, useEffect } from "react";
import Header from "./Header.jsx";
import Footer from "./Footer.jsx";
import TelegramPopup from "../../../domain/support/ui/TelegramPopup.jsx";
import { fetchReply } from '../../../domain/support/api/contactApi.js';
import styles from './Layout.module.css';

const INQUIRY_KEY = 'chs_inquiry_id';

/**
 * @param {React.ReactNode} children     - 페이지 본문
 * @param {string[]}        footerCenter - 하단 기술 태그 목록
 */
function Layout({ children, footerCenter = [] }) {
    const [isSupportOpen, setIsSupportOpen] = useState(false);
    const [inquiryId, setInquiryId] = useState(() => localStorage.getItem(INQUIRY_KEY));
    const [inquiry, setInquiry]     = useState(null);  // { message, createdAt, replyText, repliedAt }
    const [hasReply, setHasReply]   = useState(false);

    // 페이지 로드 시 답변 여부 확인
    useEffect(() => {
        if (!inquiryId) return;
        fetchReply(inquiryId)
            .then(data => { if (data) { setInquiry(data); setHasReply(true); } })
            .catch(() => {});
    }, [inquiryId]);

    // 문의 전송 완료 후 새 ID 반영
    const handleSent = (newId) => {
        localStorage.setItem(INQUIRY_KEY, newId);
        setInquiryId(newId);
        setInquiry(null);
        setHasReply(false);
    };

    return (
        <div className={styles.layout}>
            <Header />
            <TelegramPopup
                isOpen={isSupportOpen}
                onClose={() => setIsSupportOpen(false)}
                inquiry={inquiry}
                onSent={handleSent}
            />
            <main className={styles.main}>
                {/* 메인 컨텐츠 영역 (페이지 본문이 들어감) */}
                {children}
            </main>
            <Footer centerTech={footerCenter} onAdminClick={() => { setIsSupportOpen(true); if (hasReply) setHasReply(false); }} hasReply={hasReply} />
        </div>
    );
}

export default Layout;
