// [AGENT] 인증 테스트 페이지 — /api/auth/login + /api/admin/test/auth/debug 호출로 token 응답 확인
import { useEffect, useMemo, useState } from 'react';
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

function parseJwtPayload(token) {
    try {
        const base64 = token.split('.')[1];
        if (!base64) return null;
        const normalized = base64.replace(/-/g, '+').replace(/_/g, '/');
        const json = decodeURIComponent(
            atob(normalized)
                .split('')
                .map((ch) => `%${(`00${ch.charCodeAt(0).toString(16)}`).slice(-2)}`)
                .join('')
        );
        return JSON.parse(json);
    } catch {
        return null;
    }
}

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
    const [result, setResult] = useState(null);
    const [redisResult, setRedisResult] = useState(null);
    const [accessResult, setAccessResult] = useState(null);
    const [error, setError] = useState(null);
    const [nowMs, setNowMs] = useState(Date.now());
    const [loginAtMs, setLoginAtMs] = useState(null);

    useEffect(() => {
        const timer = window.setInterval(() => {
            setNowMs(Date.now());
        }, 1000);
        return () => window.clearInterval(timer);
    }, []);

    const accessPayload = useMemo(() => {
        if (!result?.accessToken) return null;
        return parseJwtPayload(result.accessToken);
    }, [result]);

    const accessRemainSeconds = useMemo(() => {
        const exp = accessPayload?.exp;
        if (!exp) return null;
        return Math.max(0, Math.floor(exp - nowMs / 1000));
    }, [accessPayload, nowMs]);

    const refreshRemainSeconds = useMemo(() => {
        if (redisResult?.ttlSeconds == null) return null;
        if (!loginAtMs) return redisResult.ttlSeconds;
        const elapsed = Math.max(0, Math.floor((nowMs - loginAtMs) / 1000));
        return Math.max(0, redisResult.ttlSeconds - elapsed);
    }, [redisResult, loginAtMs, nowMs]);

    const tokenSummary = useMemo(() => {
        return {
            accessStatus: accessRemainSeconds > 0 ? 'VALID' : (accessRemainSeconds === 0 ? 'EXPIRED' : '-'),
            accessRemain: formatRemain(accessRemainSeconds),
            refreshStatus: refreshRemainSeconds > 0 ? 'STORED' : (refreshRemainSeconds === 0 ? 'EXPIRED' : '-'),
            refreshRemain: formatRemain(refreshRemainSeconds),
            subject: accessPayload?.sub ?? '-',
            permissionCount: Array.isArray(accessPayload?.permissionCodes) ? accessPayload.permissionCodes.length : 0,
        };
    }, [accessPayload, accessRemainSeconds, refreshRemainSeconds]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (isSubmitting) return;

        setIsSubmitting(true);
        setResult(null);
        setRedisResult(null);
        setAccessResult(null);
        setError(null);
        setLoginAtMs(null);

        try {
            const requestStartMs = Date.now();
            const res = await apiClient.post('/api/auth/login', {
                email,
                password,
            });
            setResult(res.data);
            setLoginAtMs(requestStartMs);

            const refreshToken = res?.data?.refreshToken;
            if (refreshToken) {
                const redisRes = await apiClient.post('/api/admin/test/auth/debug/refresh-token', {
                    refreshToken,
                });
                setRedisResult(redisRes.data);
            }
        } catch (err) {
            setError(err?.response?.data ?? { message: '요청 실패', errorCode: 'AUTH_TEST_UNKNOWN' });
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleAccessCheck = async () => {
        const accessToken = result?.accessToken;
        if (!accessToken) return;

        try {
            const res = await apiClient.post('/api/admin/test/auth/debug/access-token', {
                accessToken,
            });
            setAccessResult(res.data);
        } catch (err) {
            setAccessResult(err?.response?.data ?? { valid: false, message: 'ACCESS_TOKEN_CHECK_FAILED' });
        }
    };

    return (
        <div style={wrapStyle}>
            <div style={cardStyle}>
                <div>
                    <div style={{ fontSize: '24px', fontWeight: 700 }}>Auth Test</div>
                    <div style={{ opacity: 0.8, marginTop: '6px' }}>
                        로그인 테스트 페이지. /api/auth/login 응답을 바로 확인합니다.
                    </div>
                </div>

                <div style={statusGridStyle}>
                    <div style={statusCardStyle}>
                        <div style={{ fontWeight: 700 }}>Access Status</div>
                        <div>{tokenSummary.accessStatus}</div>
                        <div>남은 시간: {tokenSummary.accessRemain}</div>
                    </div>
                    <div style={statusCardStyle}>
                        <div style={{ fontWeight: 700 }}>Refresh Status</div>
                        <div>{tokenSummary.refreshStatus}</div>
                        <div>남은 시간: {tokenSummary.refreshRemain}</div>
                    </div>
                    <div style={statusCardStyle}>
                        <div style={{ fontWeight: 700 }}>Token Summary</div>
                        <div>subject: {tokenSummary.subject}</div>
                        <div>permission count: {tokenSummary.permissionCount}</div>
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

                <div style={gridStyle}>
                    <div style={{ fontWeight: 700 }}>Success</div>
                    <div style={blockStyle}>
                        {result ? JSON.stringify(result, null, 2) : '응답 없음'}
                    </div>
                    <button
                        style={buttonStyle}
                        type="button"
                        onClick={handleAccessCheck}
                        disabled={!result?.accessToken}
                    >
                        access token 상태 확인
                    </button>
                </div>

                <div style={gridStyle}>
                    <div style={{ fontWeight: 700 }}>Error</div>
                    <div style={blockStyle}>
                        {error ? JSON.stringify(error, null, 2) : '에러 없음'}
                    </div>
                </div>

                <div style={gridStyle}>
                    <div style={{ fontWeight: 700 }}>Access Token Debug</div>
                    <div style={blockStyle}>
                        {accessResult ? JSON.stringify(accessResult, null, 2) : '토큰 확인 전'}
                    </div>
                </div>

                <div style={gridStyle}>
                    <div style={{ fontWeight: 700 }}>Redis Debug</div>
                    <div style={blockStyle}>
                        {redisResult ? JSON.stringify(redisResult, null, 2) : 'Redis 조회 없음'}
                    </div>
                </div>
            </div>
        </div>
    );
}
