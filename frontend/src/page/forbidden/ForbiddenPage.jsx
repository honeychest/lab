// [AGENT] 403 차단 페이지 (헤더/푸터 유지, 문의 팝업 비활성)
import { useEffect, useState } from 'react';
import apiClient from '@/api/apiClient.js';
import Layout from '../../shared/ui/layout/Layout.jsx';
import styles from './ForbiddenPage.module.css';
import '../../styles/themes/monitor-teal.css';

export default function ForbiddenPage() {
    const [isPending, setIsPending] = useState(false);

    useEffect(() => {
        // 새로고침으로 재진입 시 버튼은 기본 활성(서버에서 already_pending 처리)
        setIsPending(false);
    }, []);

    const handleRequest = async () => {
        if (isPending) return;
        setIsPending(true);
        try {
            const res = await apiClient.post('/api/monitor/access-request');
            if (res?.data?.status === 'already_pending') {
                // 이미 요청 중이면 버튼 비활성 유지
                return;
            }
        } catch {
            // 요청 실패해도 UX는 단순 유지
        } finally {
            // 텔레그램 딥링크 시도 (미설치면 무시)
            try {
                window.location.href = 'tg://';
            } catch {
                // ignore
            }
        }
    };

    return (
        <Layout enableSupport={false} footerCenter={['Access Control', 'Telegram', 'Redis']}>
            <div className={styles.wrap}>
                <div className={styles.card}>
                    <div className={styles.title}>🔒 접근 제한</div>
                    <div className={styles.desc}>이 페이지는 허가된 IP만 접근 가능합니다.</div>
                    <button
                        type="button"
                        className={styles.button}
                        onClick={handleRequest}
                        disabled={isPending}
                    >
                        접근 승인 요청하기
                    </button>
                    <div className={styles.hint}>
                        요청 후 텔레그램에서 관리자가 승인시 자동으로 허용됩니다.
                    </div>
                </div>
            </div>
        </Layout>
    );
}

