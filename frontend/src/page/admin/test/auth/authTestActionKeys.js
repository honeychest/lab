/** 메트릭 컬럼에 표시할 액션 키 순서 (cursorplan.md) */
export const AUTH_TEST_METRIC_ORDER = [
    { key: 'login', title: 'Login' },
    { key: 'cookieSnapshot', title: 'Cookie Snapshot' },
    { key: 'refreshAccess', title: 'Refresh Access' },
    { key: 'logout', title: 'Logout' },
    { key: 'invalidateRefreshRedis', title: 'Invalidate Refresh (Redis only)' },
    { key: 'debugAccessFromCookie', title: 'Debug Access (from cookie)' },
    { key: 'debugRefreshFromCookie', title: 'Debug Refresh (from cookie)' },
    { key: 'debugAccessToken', title: 'Debug Access (body)' },
    { key: 'debugRefreshToken', title: 'Debug Refresh (body)' },
    { key: 'fullCheck', title: 'Run Full Auth Check' },
    { key: 'negativeChecks', title: 'Run Negative Checks' },
    { key: 'regressionSupportSse', title: '비회귀: Support SSE (bad guestToken)' },
    { key: 'regressionBinanceDate', title: '비회귀: Binance trades (bad date)' },
];
