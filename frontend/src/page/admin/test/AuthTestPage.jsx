// [AGENT] 인증 테스트 페이지 — httpOnly 쿠키 기반 인증 흐름 확인
// 로그인 → 쿠키 자동 설정 → /api/admin/test/auth/debug/cookie-info 로 토큰 상태 조회
import { useEffect, useState } from 'react';
import apiClient from '@/api/apiClient.js';
import '../../../styles/themes/monitor-teal.css';

const wrapStyle = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
};

const cardStyle = {
    width: '100%',
    maxWidth: '720px',
    border: '1px solid rgba(255,255,255,0.18)',
    background: 'rgba(255,255,255,0.04)',
    padding: '24px',
    display: 'grid',
    gap: '16px',
    boxShadow: '0 10px 30px rgba(0,0,0,0.25)',
};

const gridStyle = {
    display: 'grid',
    gap: '12px',
};

const inputStyle = {
    width: '100%',
    padding: '12px 14px',
    border: '1px solid rgba(255,255,255,0.16)',
    background: 'rgba(0,0,0,0.15)',
    color: '#fff',
    outline: 'none',
};

const buttonStyle = {
    padding: '12px 16px',
    border: '1px solid rgba(255,255,255,0.22)',
    background: 'rgba(0, 180, 160, 0.18)',
    color: '#fff',
    cursor: 'pointer',
};

const blockStyle = {
    border: '1px solid rgba(255,255,255,0.12)',
    background: 'rgba(0,0,0,0.18)',
    padding: '14px',
    overflow: 'auto',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
};

const statusGridStyle = {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
    gap: '12px',
};

const statusCardStyle = {
    border: '1px solid rgba(255,255,255,0.12)',
    background: 'rgba(0,0,0,0.18)',
    padding: '14px',
    display: 'grid',
    gap: '8px',
};

function formatRemain(seconds) {
    if (seconds == null) return '-';
    if (seconds <= 0) return '0s';
    const min = Math.floor(seconds / 60);
    const sec = seconds % 60;
    if (min <= 0) return `${sec}s`;
    return `${min}m ${sec}s`;
}

export default function AuthTestPage() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [cookieInfo, setCookieInfo] = useState(null);       // /debug/cookie-info 응답
    const [fetchedAtMs, setFetchedAtMs] = useState(null);     // cookie-info 조회 시각
    const [error, setError] = useState(null);
    const [nowMs, setNowMs] = useState(Date.now());

    useEffect(() => {
        const timer = window.setInterval(() => {
            setNowMs(Date.now());
        }, 1000);
        return () => window.clearInterval(timer);
    }, []);

    // cookie-info 조회 시점으로부터 경과된 시간을 빼서 남은 refresh TTL 계산
    const refreshRemainSeconds = (() => {
        const ttl = cookieInfo?.refresh?.ttlSeconds;
        if (ttl == null || fetchedAtMs == null) return null;
        const elapsed = Math.max(0, Math.floor((nowMs - fetchedAtMs) / 1000));
        return Math.max(0, ttl - elapsed);
    })();

    const fetchCookieInfo = async () => {
        const res = await apiClient.get('/api/admin/test/auth/debug/cookie-info');
        setCookieInfo(res.data);
        setFetchedAtMs(Date.now());
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (isSubmitting) return;

        setIsSubmitting(true);
        setCookieInfo(null);
        setFetchedAtMs(null);
        setError(null);

        try {
            await apiClient.post('/api/auth/login', { email, password });
            // 로그인 성공 → 쿠키 설정됨 → 바로 cookie-info 조회
            await fetchCookieInfo();
        } catch (err) {
            setError(err?.response?.data ?? { message: '요청 실패', errorCode: 'AUTH_TEST_UNKNOWN' });
        } finally {
            setIsSubmitting(false);
        }
    };

    const accessInfo = cookieInfo?.access;
    const refreshInfo = cookieInfo?.refresh;

    return (
        <div style={wrapStyle}>
            <div style={cardStyle}>
                <div>
                    <div style={{ fontSize: '24px', fontWeight: 700 }}>Auth Test</div>
                    <div style={{ opacity: 0.8, marginTop: '6px' }}>
                        httpOnly 쿠키 기반 인증 테스트. 로그인 후 쿠키 상태를 서버에서 조회합니다.
                    </div>
                </div>

                <div style={statusGridStyle}>
                    <div style={statusCardStyle}>
                        <div style={{ fontWeight: 700 }}>Access Status</div>
                        <div>{accessInfo ? (accessInfo.valid ? 'VALID' : 'INVALID') : '-'}</div>
                        <div>userId: {accessInfo?.userId ?? '-'}</div>
                        <div>만료: {accessInfo?.expiresAt ?? '-'}</div>
                    </div>
                    <div style={statusCardStyle}>
                        <div style={{ fontWeight: 700 }}>Refresh Status</div>
                        <div>{refreshInfo ? (refreshInfo.stored ? 'STORED' : 'NOT STORED') : '-'}</div>
                        <div>남은 시간: {formatRemain(refreshRemainSeconds)}</div>
                    </div>
                    <div style={statusCardStyle}>
                        <div style={{ fontWeight: 700 }}>Permissions</div>
                        <div>
                            {accessInfo?.permissionCodes?.length
                                ? accessInfo.permissionCodes.join(', ')
                                : '-'}
                        </div>
                    </div>
                </div>

                <form style={gridStyle} onSubmit={handleSubmit}>
                    <input
                        style={inputStyle}
                        type="email"
                        placeholder="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                    />
                    <input
                        style={inputStyle}
                        type="password"
                        placeholder="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                    />
                    <button style={buttonStyle} type="submit" disabled={isSubmitting}>
                        {isSubmitting ? '로그인 요청 중...' : '로그인 테스트'}
                    </button>
                </form>

                <button
                    style={buttonStyle}
                    type="button"
                    onClick={fetchCookieInfo}
                    disabled={!cookieInfo}
                >
                    쿠키 상태 새로고침
                </button>

                <div style={gridStyle}>
                    <div style={{ fontWeight: 700 }}>Cookie Debug 응답</div>
                    <div style={blockStyle}>
                        {cookieInfo ? JSON.stringify(cookieInfo, null, 2) : '응답 없음'}
                    </div>
                </div>

                <div style={gridStyle}>
                    <div style={{ fontWeight: 700 }}>Error</div>
                    <div style={blockStyle}>
                        {error ? JSON.stringify(error, null, 2) : '에러 없음'}
                    </div>
                </div>
            </div>
        </div>
    );
}
