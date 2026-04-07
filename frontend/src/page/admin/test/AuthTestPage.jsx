// [AGENT] 인증 테스트 페이지 — httpOnly 쿠키 기반 (admin/test 전용)
// 실행: api/adminTest/auth.js · 기록: shared/logApiCall + 3열 컴포넌트
import { useEffect, useMemo, useState } from 'react';
import {
    debugAccessToken,
    debugAccessTokenFromCookie,
    debugRefreshToken,
    debugRefreshTokenFromCookie,
    fetchCookieDebug,
    invalidateRefreshRedisOnly,
    login,
    logout,
    refreshAccessToken,
    refreshAccessTokenOmitCredentials,
} from '@/api/adminTest/auth.js';
import {
    fetchBinanceTradesBadDate,
    fetchSupportSseBadGuestToken,
} from '@/api/adminTest/regressionApi.js';
import { logApiCall } from './shared/logApiCall.js';
import AuthTestActionsColumn from './auth/AuthTestActionsColumn.jsx';
import AuthTestAnalysisColumn from './auth/AuthTestAnalysisColumn.jsx';
import AuthTestMetricsColumn from './auth/AuthTestMetricsColumn.jsx';
import {
    getGridStyle,
    pageDescriptionStyle,
    pageRootStyle,
    pageTitleStyle,
} from './auth/authTestStyles.js';
import '../../../styles/themes/monitor-teal.css';

const BREAKPOINT = 1200;

function stepFromLog(name, log) {
    return {
        name,
        ok: log.ok,
        durationMs: log.durationMs,
        statusCode: log.statusCode,
        errorMessage: log.errorMessage,
    };
}

function buildSequenceLog(requestSummary, startedAtIso, totalMs, steps, allOk, firstError) {
    return {
        ok: allOk,
        startedAt: startedAtIso,
        durationMs: totalMs,
        statusCode: null,
        requestSummary,
        errorMessage: allOk ? null : (firstError ?? '일부 단계 실패'),
        responseBody: { steps },
    };
}

function bodyLooksLikeAuthLoginFailed(body) {
    if (body == null) return false;
    if (typeof body === 'object' && body.errorCode === 'AUTH_LOGIN_FAILED') return true;
    if (typeof body === 'string' && body.includes('AUTH_LOGIN_FAILED')) return true;
    return false;
}

/**
 * 비회귀: HTTP 400/500이어도 auth 전용(AuthErrorResponse + AUTH_LOGIN_FAILED)만 아니면 통과로 표시한다.
 * (logApiCall은 4xx/5xx를 ok:false로 두므로 여기서 덮어씀)
 */
function enrichRegressionLog(log, passHint) {
    if (bodyLooksLikeAuthLoginFailed(log.responseBody)) {
        return {
            ...log,
            ok: false,
            errorMessage: [log.errorMessage, '비회귀 실패: AUTH_LOGIN_FAILED(auth 전용)로 변질됨']
                .filter(Boolean)
                .join(' · '),
        };
    }
    return {
        ...log,
        ok: true,
        errorMessage: null,
        requestSummary: `${log.requestSummary} · ${passHint}`,
    };
}

export default function AuthTestPage() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [manualAccessToken, setManualAccessToken] = useState('');
    const [manualRefreshToken, setManualRefreshToken] = useState('');
    const [writeConfirmed, setWriteConfirmed] = useState(false);
    const [runningAction, setRunningAction] = useState(null);

    const [cookieInfo, setCookieInfo] = useState(null);
    const [fetchedAtMs, setFetchedAtMs] = useState(null);
    const [accessDebugPayload, setAccessDebugPayload] = useState(null);
    const [refreshDebugPayload, setRefreshDebugPayload] = useState(null);
    const [actionLogs, setActionLogs] = useState({});

    const [nowMs, setNowMs] = useState(() => Date.now());
    const [isNarrow, setIsNarrow] = useState(() => window.innerWidth < BREAKPOINT);

    const patchLog = (key, log) => {
        setActionLogs((prev) => ({ ...prev, [key]: log }));
    };

    const applyCookieSnapshotLog = (log) => {
        if (log.ok && log.responseBody != null) {
            setCookieInfo(log.responseBody);
            setFetchedAtMs(Date.now());
        }
    };

    useEffect(() => {
        const timer = window.setInterval(() => {
            setNowMs(Date.now());
        }, 1000);
        return () => window.clearInterval(timer);
    }, []);

    useEffect(() => {
        const onResize = () => setIsNarrow(window.innerWidth < BREAKPOINT);
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, []);

    const refreshRemainSeconds = (() => {
        const ttl = cookieInfo?.refresh?.ttlSeconds;
        if (ttl == null || fetchedAtMs == null) return null;
        const elapsed = Math.max(0, Math.floor((nowMs - fetchedAtMs) / 1000));
        return Math.max(0, ttl - elapsed);
    })();

    const handleCookieSnapshot = async () => {
        if (runningAction) return;
        setRunningAction('cookieSnapshot');
        const log = await logApiCall(
            'GET /api/admin/test/auth/debug/cookie-info',
            () => fetchCookieDebug(),
        );
        patchLog('cookieSnapshot', log);
        applyCookieSnapshotLog(log);
        setRunningAction(null);
    };

    const handleLogin = async (e) => {
        e.preventDefault();
        if (runningAction || !writeConfirmed) return;
        const safeEmail = (email || '').trim();
        if (!safeEmail) return;

        setRunningAction('login');
        setCookieInfo(null);
        setFetchedAtMs(null);
        setAccessDebugPayload(null);
        setRefreshDebugPayload(null);

        const log = await logApiCall(
            `POST /api/auth/login (email: ${safeEmail})`,
            () => login({ email: safeEmail, password }),
        );
        patchLog('login', log);

        if (log.ok) {
            const snap = await logApiCall(
                'GET /api/admin/test/auth/debug/cookie-info',
                () => fetchCookieDebug(),
            );
            patchLog('cookieSnapshot', snap);
            applyCookieSnapshotLog(snap);
        }

        setRunningAction(null);
    };

    const handleRefreshAccessToken = async () => {
        if (runningAction) return;
        setRunningAction('refreshAccess');
        const log = await logApiCall(
            'POST /api/auth/refresh',
            () => refreshAccessToken(),
        );
        patchLog('refreshAccess', log);
        if (log.ok) {
            const snap = await logApiCall(
                'GET /api/admin/test/auth/debug/cookie-info',
                () => fetchCookieDebug(),
            );
            patchLog('cookieSnapshot', snap);
            applyCookieSnapshotLog(snap);
        }
        setRunningAction(null);
    };

    const handleLogout = async () => {
        if (runningAction) return;
        setRunningAction('logout');
        const log = await logApiCall(
            'POST /api/auth/logout',
            () => logout(),
        );
        patchLog('logout', log);
        setCookieInfo(null);
        setFetchedAtMs(null);
        setAccessDebugPayload(null);
        setRefreshDebugPayload(null);
        setRunningAction(null);
    };

    const handleInvalidateRefreshRedis = async () => {
        if (runningAction) return;
        setRunningAction('invalidateRefreshRedis');
        const log = await logApiCall(
            'POST /api/admin/test/auth/invalidate-refresh-redis',
            () => invalidateRefreshRedisOnly(),
        );
        patchLog('invalidateRefreshRedis', log);
        setRunningAction(null);
    };

    const handleDebugAccessToken = async () => {
        if (runningAction) return;
        const token = (manualAccessToken || '').trim();
        if (!token) {
            patchLog('debugAccessToken', {
                ok: false,
                startedAt: new Date().toISOString(),
                durationMs: 0,
                statusCode: null,
                responseBody: null,
                errorMessage: 'accessToken 입력이 비어 있습니다.',
                requestSummary: 'POST /api/admin/test/auth/debug/access-token',
            });
            return;
        }
        setRunningAction('debugAccessToken');
        const log = await logApiCall(
            'POST /api/admin/test/auth/debug/access-token',
            () => debugAccessToken(token),
        );
        patchLog('debugAccessToken', log);
        if (log.ok && log.responseBody != null) {
            setAccessDebugPayload(log.responseBody);
        }
        setRunningAction(null);
    };

    const handleDebugRefreshToken = async () => {
        if (runningAction) return;
        const token = (manualRefreshToken || '').trim();
        if (!token) {
            patchLog('debugRefreshToken', {
                ok: false,
                startedAt: new Date().toISOString(),
                durationMs: 0,
                statusCode: null,
                responseBody: null,
                errorMessage: 'refreshToken 입력이 비어 있습니다.',
                requestSummary: 'POST /api/admin/test/auth/debug/refresh-token',
            });
            return;
        }
        setRunningAction('debugRefreshToken');
        const log = await logApiCall(
            'POST /api/admin/test/auth/debug/refresh-token',
            () => debugRefreshToken(token),
        );
        patchLog('debugRefreshToken', log);
        if (log.ok && log.responseBody != null) {
            setRefreshDebugPayload(log.responseBody);
        }
        setRunningAction(null);
    };

    const handleDebugAccessFromCookie = async () => {
        if (runningAction) return;
        setRunningAction('debugAccessFromCookie');
        const log = await logApiCall(
            'POST /api/admin/test/auth/debug/access-token-from-cookie',
            () => debugAccessTokenFromCookie(),
        );
        patchLog('debugAccessFromCookie', log);
        if (log.ok && log.responseBody != null) {
            setAccessDebugPayload(log.responseBody);
        }
        setRunningAction(null);
    };

    const handleDebugRefreshFromCookie = async () => {
        if (runningAction) return;
        setRunningAction('debugRefreshFromCookie');
        const log = await logApiCall(
            'POST /api/admin/test/auth/debug/refresh-token-from-cookie',
            () => debugRefreshTokenFromCookie(),
        );
        patchLog('debugRefreshFromCookie', log);
        if (log.ok && log.responseBody != null) {
            setRefreshDebugPayload(log.responseBody);
        }
        setRunningAction(null);
    };

    const handleRunFullAuthCheck = async () => {
        if (runningAction) return;
        if (!writeConfirmed) return;
        const safeEmail = (email || '').trim();
        if (!safeEmail) return;

        setRunningAction('fullCheck');
        const steps = [];
        const startedAtIso = new Date().toISOString();
        const t0 = performance.now();

        const lLogin = await logApiCall(
            `POST /api/auth/login (email: ${safeEmail})`,
            () => login({ email: safeEmail, password }),
        );
        steps.push(stepFromLog('login', lLogin));

        if (!lLogin.ok) {
            const totalMs = Math.round(performance.now() - t0);
            patchLog(
                'fullCheck',
                buildSequenceLog(
                    'Run Full Auth Check',
                    startedAtIso,
                    totalMs,
                    steps,
                    false,
                    lLogin.errorMessage,
                ),
            );
            setRunningAction(null);
            return;
        }

        const lSnap1 = await logApiCall(
            'GET /api/admin/test/auth/debug/cookie-info',
            () => fetchCookieDebug(),
        );
        steps.push(stepFromLog('cookie_snapshot_1', lSnap1));
        if (lSnap1.ok && lSnap1.responseBody) {
            setCookieInfo(lSnap1.responseBody);
            setFetchedAtMs(Date.now());
        }

        const lAcc = await logApiCall(
            'POST /api/admin/test/auth/debug/access-token-from-cookie',
            () => debugAccessTokenFromCookie(),
        );
        steps.push(stepFromLog('debug_access_from_cookie', lAcc));
        if (lAcc.ok && lAcc.responseBody) {
            setAccessDebugPayload(lAcc.responseBody);
        }

        const lRef = await logApiCall(
            'POST /api/admin/test/auth/debug/refresh-token-from-cookie',
            () => debugRefreshTokenFromCookie(),
        );
        steps.push(stepFromLog('debug_refresh_from_cookie', lRef));
        if (lRef.ok && lRef.responseBody) {
            setRefreshDebugPayload(lRef.responseBody);
        }

        const lRefresh = await logApiCall(
            'POST /api/auth/refresh',
            () => refreshAccessToken(),
        );
        steps.push(stepFromLog('refresh_access', lRefresh));

        const lSnap2 = await logApiCall(
            'GET /api/admin/test/auth/debug/cookie-info',
            () => fetchCookieDebug(),
        );
        steps.push(stepFromLog('cookie_snapshot_2', lSnap2));
        if (lSnap2.ok && lSnap2.responseBody) {
            setCookieInfo(lSnap2.responseBody);
            setFetchedAtMs(Date.now());
        }

        const totalMs = Math.round(performance.now() - t0);
        const allOk = steps.every((s) => s.ok);
        const firstFail = steps.find((s) => !s.ok);
        patchLog(
            'fullCheck',
            buildSequenceLog(
                'Run Full Auth Check',
                startedAtIso,
                totalMs,
                steps,
                allOk,
                firstFail?.errorMessage,
            ),
        );
        setRunningAction(null);
    };

    const handleRunNegativeChecks = async () => {
        if (runningAction) return;
        setRunningAction('negativeChecks');
        const steps = [];
        const startedAtIso = new Date().toISOString();
        const t0 = performance.now();

        const lWrong = await logApiCall(
            'POST /api/auth/login (wrong credentials)',
            () => login({ email: 'wrong-auth-test@invalid.local', password: 'wrong-password-!@#' }),
        );
        steps.push(stepFromLog('wrong_login', lWrong));

        const lOmit = await logApiCall(
            'POST /api/auth/refresh (credentials: omit)',
            () => refreshAccessTokenOmitCredentials(),
        );
        steps.push(stepFromLog('refresh_without_cookie', lOmit));

        const lBadAccess = await logApiCall(
            'POST /api/admin/test/auth/debug/access-token (malformed)',
            () => debugAccessToken('not.a.valid.jwt'),
        );
        steps.push(stepFromLog('debug_access_malformed', lBadAccess));

        const lBadRefresh = await logApiCall(
            'POST /api/admin/test/auth/debug/refresh-token (malformed)',
            () => debugRefreshToken('___malformed_refresh___'),
        );
        steps.push(stepFromLog('debug_refresh_malformed', lBadRefresh));

        const totalMs = Math.round(performance.now() - t0);
        const expectedFailLogin = !lWrong.ok;
        const expectedFailRefresh = !lOmit.ok;
        const suiteLogicalOk = expectedFailLogin && expectedFailRefresh && lBadAccess.ok && lBadRefresh.ok;
        patchLog('negativeChecks', {
            ok: suiteLogicalOk,
            startedAt: startedAtIso,
            durationMs: totalMs,
            statusCode: null,
            requestSummary: 'Run Negative Checks',
            errorMessage: suiteLogicalOk
                ? null
                : '기대와 다른 결과(잘못된 로그인·쿠키 없는 refresh는 실패해야 함)',
            responseBody: { steps },
        });
        setRunningAction(null);
    };

    const handleRegressionSupportSse = async () => {
        if (runningAction) return;
        setRunningAction('regressionSupportSse');
        const raw = await logApiCall(
            'GET /api/support/reply/sse?guestToken=invalid',
            () => fetchSupportSseBadGuestToken(),
        );
        patchLog(
            'regressionSupportSse',
            enrichRegressionLog(
                raw,
                '비회귀 통과: AUTH_LOGIN_FAILED 미포함 (잘못된 guestToken은 종종 HTTP 500·미처리 예외)',
            ),
        );
        setRunningAction(null);
    };

    const handleRegressionBinanceDate = async () => {
        if (runningAction) return;
        setRunningAction('regressionBinanceDate');
        const raw = await logApiCall(
            'GET /api/binance/trades?from=2024/01/15',
            () => fetchBinanceTradesBadDate(),
        );
        patchLog(
            'regressionBinanceDate',
            enrichRegressionLog(
                raw,
                '비회귀 통과: AUTH_LOGIN_FAILED 미포함 (잘못된 날짜는 HTTP 400 + error 기대)',
            ),
        );
        setRunningAction(null);
    };

    const regressionHint = useMemo(() => {
        const parts = [
            '비회귀 판정: 응답 본문이 로그인 실패 JSON(errorCode=AUTH_LOGIN_FAILED)이 아니면 통과입니다.',
            '· Support SSE: 500이어도 정상일 수 있음(구 IllegalArgumentException이 auth 핸들러에 안 걸린 경우).',
            '· Binance: 400 + error 필드면 도메인 검증 응답으로 정상입니다.',
        ];
        return parts.join('\n');
    }, []);

    return (
        <div style={pageRootStyle}>
            <div>
                <div style={pageTitleStyle}>Auth Test</div>
                <div style={pageDescriptionStyle}>
                    httpOnly 쿠키 기반. 실행 / 응답 분석 / 메트릭을 한 화면에서 확인합니다.
                </div>
            </div>

            <div style={getGridStyle(isNarrow)}>
                <AuthTestActionsColumn
                    email={email}
                    password={password}
                    manualAccessToken={manualAccessToken}
                    manualRefreshToken={manualRefreshToken}
                    writeConfirmed={writeConfirmed}
                    runningAction={runningAction}
                    onEmailChange={setEmail}
                    onPasswordChange={setPassword}
                    onManualAccessTokenChange={setManualAccessToken}
                    onManualRefreshTokenChange={setManualRefreshToken}
                    onWriteConfirmedChange={setWriteConfirmed}
                    onLogin={handleLogin}
                    onCookieSnapshot={handleCookieSnapshot}
                    onRefreshAccess={handleRefreshAccessToken}
                    onLogout={handleLogout}
                    onInvalidateRefreshRedis={handleInvalidateRefreshRedis}
                    onDebugAccessToken={handleDebugAccessToken}
                    onDebugRefreshToken={handleDebugRefreshToken}
                    onDebugAccessFromCookie={handleDebugAccessFromCookie}
                    onDebugRefreshFromCookie={handleDebugRefreshFromCookie}
                    onRunFullAuthCheck={handleRunFullAuthCheck}
                    onRunNegativeChecks={handleRunNegativeChecks}
                    onRegressionSupportSse={handleRegressionSupportSse}
                    onRegressionBinanceDate={handleRegressionBinanceDate}
                />
                <AuthTestAnalysisColumn
                    cookieInfo={cookieInfo}
                    refreshRemainSeconds={refreshRemainSeconds}
                    accessDebugPayload={accessDebugPayload}
                    refreshDebugPayload={refreshDebugPayload}
                    regressionHint={regressionHint}
                />
                <AuthTestMetricsColumn actionLogs={actionLogs} />
            </div>
        </div>
    );
}
