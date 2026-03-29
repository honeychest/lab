// [AGENT] 공통 레이아웃 — guestToken 기반 문의 목록 조회 + 미읽음 배지 관리 + 방문 기록
// 연관: TelegramPopup.jsx, Footer.jsx, contactApi.js
import React, { useState, useEffect, useCallback, useRef } from "react";
import apiClient from "@/api/apiClient.js";
import Header from "./Header.jsx";
import Footer from "./Footer.jsx";
import OverLoadToast from "@/components/toast/OverLoadToast.jsx"
import TelegramPopup from "@/domain/support/ui/TelegramPopup.jsx";
import { fetchInquiries, markReplyRead, getGuestToken } from '@/domain/support/api/contactApi.js';
import styles from './Layout.module.css';
import '@/app/style/coolors.css';

/**
 * @param {React.ReactNode} children     - 페이지 본문
 * @param {string[]}        footerCenter - 하단 기술 태그 목록
 * @param {boolean}         enableSupport - 문의(텔레그램 팝업) 기능 사용 여부
 */
function Layout({ children, footerCenter = [], enableSupport = true }) {
    const [isSupportOpen, setIsSupportOpen] = useState(false);
    const [inquiries, setInquiries]         = useState([]);
    const [hasReply, setHasReply]           = useState(false);

    const guestToken = getGuestToken();
    const visitedRef = useRef(false);

    const loadInquiries = useCallback(async () => {
        try {
            const data = await fetchInquiries(guestToken);
            setInquiries(data);
            setHasReply(data.some(i => i.replyText && !i.readAt));
        } catch {
            // 조회 실패 시 조용히 무시
        }
    }, [guestToken]);

    useEffect(() => {
        if (visitedRef.current) return;
        visitedRef.current = true;
        apiClient.post('/api/visitor/log', { path: window.location.pathname }).catch(() => {});
    }, []);

    useEffect(() => {
        if (!enableSupport) return;
        const id = window.setTimeout(() => {
            loadInquiries();
        }, 0);
        return () => window.clearTimeout(id);
    }, [loadInquiries, enableSupport]);

    // SSE 구독 — 답장 도착 시 실시간으로 목록 갱신
    useEffect(() => {
        if (!enableSupport) return;
        const es = new EventSource(`/api/support/reply/sse?guestToken=${guestToken}`);
        es.addEventListener('reply', () => loadInquiries());
        return () => es.close();
    }, [guestToken, loadInquiries, enableSupport]);

    // 팝업 열기 — 미읽음 답변 있으면 모두 읽음 처리 후 배지 제거
    const handleOpen = async () => {
        setIsSupportOpen(true);
        if (hasReply) {
            const unread = inquiries.filter(i => i.replyText && !i.readAt);
            await Promise.all(unread.map(i => markReplyRead(i.inquiryId, guestToken)));
            setHasReply(false);
        }
    };

    // 문의 전송 완료 후 목록 갱신
    const handleSent = () => { loadInquiries(); };

    return (
        <div className={styles.layout}>
            <OverLoadToast />
            <Header />
            {enableSupport && (
                <TelegramPopup
                    isOpen={isSupportOpen}
                    onClose={() => setIsSupportOpen(false)}
                    guestToken={guestToken}
                    inquiries={inquiries}
                    onSent={handleSent}
                />
            )}
            <main className={styles.main}>
                {children}
            </main>
            <Footer
                centerTech={footerCenter}
                onAdminClick={enableSupport ? handleOpen : undefined}
                hasReply={enableSupport ? hasReply : false}
            />
        </div>
    );
}

export default Layout;
