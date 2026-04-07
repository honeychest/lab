import { columnCardStyle, sectionDescriptionStyle, sectionTitleStyle, subCardStyle } from './authTestStyles.js';

const preStyle = {
    margin: 0,
    fontSize: '11px',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    maxHeight: '160px',
    overflow: 'auto',
    fontFamily: 'ui-monospace, monospace',
};

function formatRemain(seconds) {
    if (seconds == null) return '-';
    if (seconds <= 0) return '0s';
    const min = Math.floor(seconds / 60);
    const sec = seconds % 60;
    if (min <= 0) return `${sec}s`;
    return `${min}m ${sec}s`;
}

function formatJson(data) {
    if (data == null) return '(없음)';
    try {
        return JSON.stringify(data, null, 2);
    } catch {
        return String(data);
    }
}

export default function AuthTestAnalysisColumn({
    cookieInfo,
    refreshRemainSeconds,
    accessDebugPayload,
    refreshDebugPayload,
    regressionHint,
}) {
    const accessInfo = cookieInfo?.access;
    const refreshInfo = cookieInfo?.refresh;

    return (
        <section style={columnCardStyle}>
            <div style={sectionTitleStyle}>응답 분석</div>
            <div style={sectionDescriptionStyle}>
                Cookie 스냅샷과 마지막 토큰 디버그 응답을 요약합니다.
            </div>

            <div style={subCardStyle}>
                <div style={{ fontWeight: 700 }}>Access Status (cookie-info)</div>
                <div>{accessInfo ? (accessInfo.valid ? 'VALID' : 'INVALID') : '-'}</div>
                <div>userId: {accessInfo?.userId ?? '-'}</div>
                <div>만료: {accessInfo?.expiresAt ?? '-'}</div>
            </div>

            <div style={subCardStyle}>
                <div style={{ fontWeight: 700 }}>Refresh Status (cookie-info)</div>
                <div>{refreshInfo ? (refreshInfo.stored ? 'STORED' : 'NOT STORED') : '-'}</div>
                <div>남은 시간: {formatRemain(refreshRemainSeconds)}</div>
            </div>

            <div style={subCardStyle}>
                <div style={{ fontWeight: 700 }}>Permissions</div>
                <div>
                    {accessInfo?.permissionCodes?.length
                        ? accessInfo.permissionCodes.join(', ')
                        : '-'}
                </div>
            </div>

            <div style={subCardStyle}>
                <div style={{ fontWeight: 700 }}>Access token debug (마지막)</div>
                <pre style={preStyle}>{formatJson(accessDebugPayload)}</pre>
            </div>

            <div style={subCardStyle}>
                <div style={{ fontWeight: 700 }}>Refresh token debug (마지막)</div>
                <pre style={preStyle}>{formatJson(refreshDebugPayload)}</pre>
            </div>

            {regressionHint ? (
                <div style={subCardStyle}>
                    <div style={{ fontWeight: 700 }}>비회귀 힌트</div>
                    <pre style={preStyle}>{regressionHint}</pre>
                </div>
            ) : null}
        </section>
    );
}
