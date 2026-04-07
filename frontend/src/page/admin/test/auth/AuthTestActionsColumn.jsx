import {
    buttonStyle,
    columnCardStyle,
    inputStyle,
    sectionDescriptionStyle,
    sectionTitleStyle,
} from './authTestStyles.js';

const formStyle = {
    display: 'grid',
    gap: '10px',
};

const groupLabelStyle = {
    fontWeight: 700,
    marginTop: '10px',
    fontSize: '13px',
    color: 'var(--monitor-text-primary)',
};

const dividerStyle = {
    borderTop: '1px solid var(--monitor-border)',
    marginTop: '8px',
    paddingTop: '8px',
};

const secondaryButtonStyle = {
    ...buttonStyle,
    background: 'var(--monitor-sidebar-bg)',
    color: 'var(--monitor-text-primary)',
};

function ActionButton({ children, onClick, disabled, variant = 'primary', type = 'button' }) {
    const style = variant === 'secondary' ? secondaryButtonStyle : buttonStyle;
    return (
        <button style={style} type={type} onClick={onClick} disabled={disabled}>
            {children}
        </button>
    );
}

export default function AuthTestActionsColumn({
    email,
    password,
    manualAccessToken,
    manualRefreshToken,
    writeConfirmed,
    runningAction,
    onEmailChange,
    onPasswordChange,
    onManualAccessTokenChange,
    onManualRefreshTokenChange,
    onWriteConfirmedChange,
    onLogin,
    onCookieSnapshot,
    onRefreshAccess,
    onLogout,
    onInvalidateRefreshRedis,
    onDebugAccessToken,
    onDebugRefreshToken,
    onDebugAccessFromCookie,
    onDebugRefreshFromCookie,
    onRunFullAuthCheck,
    onRunNegativeChecks,
    onRegressionSupportSse,
    onRegressionBinanceDate,
}) {
    const busy = runningAction != null;

    return (
        <section style={columnCardStyle}>
            <div style={sectionTitleStyle}>실행</div>
            <div style={sectionDescriptionStyle}>
                세션·토큰 점검 액션을 한 곳에서 실행합니다. 로그인·전체 점검은 동의 체크가 필요합니다.
            </div>

            <div style={groupLabelStyle}>세션</div>
            <form style={formStyle} onSubmit={onLogin}>
                <input
                    style={inputStyle}
                    type="email"
                    placeholder="email"
                    value={email}
                    onChange={(e) => onEmailChange(e.target.value)}
                    autoComplete="username"
                />
                <input
                    style={inputStyle}
                    type="password"
                    placeholder="password"
                    value={password}
                    onChange={(e) => onPasswordChange(e.target.value)}
                    autoComplete="current-password"
                />
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '14px' }}>
                    <input
                        type="checkbox"
                        checked={writeConfirmed}
                        onChange={(e) => onWriteConfirmedChange(e.target.checked)}
                    />
                    로그인·전체 점검 등 쿠키를 바꾸는 요청에 동의합니다.
                </label>
                <ActionButton
                    type="submit"
                    disabled={busy || !writeConfirmed || !(email || '').trim()}
                >
                    {runningAction === 'login' ? 'Login…' : 'Login'}
                </ActionButton>
            </form>

            <ActionButton disabled={busy} onClick={onRefreshAccess} variant="secondary">
                {runningAction === 'refreshAccess' ? 'Refresh…' : 'Refresh Access'}
            </ActionButton>
            <ActionButton disabled={busy} onClick={onLogout} variant="secondary">
                {runningAction === 'logout' ? 'Logout…' : 'Logout'}
            </ActionButton>
            <ActionButton disabled={busy} onClick={onInvalidateRefreshRedis} variant="secondary">
                {runningAction === 'invalidateRefreshRedis' ? '처리 중…' : 'Invalidate Refresh (Redis only)'}
            </ActionButton>

            <div style={dividerStyle} />

            <div style={groupLabelStyle}>토큰 스냅샷 · 디버그</div>
            <ActionButton disabled={busy} onClick={onCookieSnapshot} variant="secondary">
                {runningAction === 'cookieSnapshot' ? '조회 중…' : 'Cookie Snapshot'}
            </ActionButton>
            <ActionButton disabled={busy} onClick={onDebugAccessFromCookie} variant="secondary">
                {runningAction === 'debugAccessFromCookie' ? '요청 중…' : 'Debug Access (from cookie)'}
            </ActionButton>
            <ActionButton disabled={busy} onClick={onDebugRefreshFromCookie} variant="secondary">
                {runningAction === 'debugRefreshFromCookie' ? '요청 중…' : 'Debug Refresh (from cookie)'}
            </ActionButton>

            <input
                style={inputStyle}
                type="text"
                placeholder="accessToken (paste for body debug)"
                value={manualAccessToken}
                onChange={(e) => onManualAccessTokenChange(e.target.value)}
                autoComplete="off"
            />
            <ActionButton disabled={busy} onClick={onDebugAccessToken}>
                {runningAction === 'debugAccessToken' ? '요청 중…' : 'Debug Access (body)'}
            </ActionButton>

            <input
                style={inputStyle}
                type="text"
                placeholder="refreshToken (paste for body debug)"
                value={manualRefreshToken}
                onChange={(e) => onManualRefreshTokenChange(e.target.value)}
                autoComplete="off"
            />
            <ActionButton disabled={busy} onClick={onDebugRefreshToken}>
                {runningAction === 'debugRefreshToken' ? '요청 중…' : 'Debug Refresh (body)'}
            </ActionButton>

            <div style={dividerStyle} />

            <div style={groupLabelStyle}>복합 점검</div>
            <ActionButton
                disabled={busy || !writeConfirmed || !(email || '').trim()}
                onClick={onRunFullAuthCheck}
            >
                {runningAction === 'fullCheck' ? '전체 점검…' : 'Run Full Auth Check'}
            </ActionButton>
            <ActionButton disabled={busy} onClick={onRunNegativeChecks} variant="secondary">
                {runningAction === 'negativeChecks' ? '부정 점검…' : 'Run Negative Checks'}
            </ActionButton>

            <div style={dividerStyle} />

            <div style={groupLabelStyle}>비회귀 (AuthExceptionHandler 범위)</div>
            <div style={{ fontSize: '12px', color: 'var(--monitor-text-secondary)' }}>
                HTTP 400/500이어도 본문에 AUTH_LOGIN_FAILED만 없으면 비회귀 통과(메트릭은 OK)입니다.
            </div>
            <ActionButton disabled={busy} onClick={onRegressionSupportSse} variant="secondary">
                {runningAction === 'regressionSupportSse' ? '요청 중…' : 'Support SSE (bad guestToken)'}
            </ActionButton>
            <ActionButton disabled={busy} onClick={onRegressionBinanceDate} variant="secondary">
                {runningAction === 'regressionBinanceDate' ? '요청 중…' : 'Binance trades (bad date)'}
            </ActionButton>
        </section>
    );
}
