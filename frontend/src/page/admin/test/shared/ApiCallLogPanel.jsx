/**
 * admin/test 전용 — logApiCall 결과를 고정 항목으로 표시한다.
 * 다른 화면에서는 import 하지 않는다.
 */

const blockStyle = {
    border: '1px solid rgba(255,255,255,0.12)',
    background: 'rgba(0,0,0,0.18)',
    padding: '14px',
    overflow: 'auto',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    fontSize: '13px',
};

const rowStyle = {
    display: 'grid',
    gap: '4px',
    marginBottom: '12px',
};

const labelStyle = { fontWeight: 700, opacity: 0.9 };

function formatBody(body) {
    if (body === null || body === undefined) return '(없음)';
    if (typeof body === 'string') return body;
    try {
        return JSON.stringify(body, null, 2);
    } catch {
        return String(body);
    }
}

export default function ApiCallLogPanel({ result, title = 'API 호출 기록' }) {
    if (result == null) {
        return null;
    }

    return (
        <div style={{ display: 'grid', gap: '10px' }}>
            <div style={labelStyle}>{title}</div>
            <div style={rowStyle}>
                <div style={labelStyle}>요청 요약</div>
                <div style={blockStyle}>{result.requestSummary ?? '-'}</div>
            </div>
            <div style={rowStyle}>
                <div style={labelStyle}>상태 코드</div>
                <div style={blockStyle}>{result.statusCode != null ? String(result.statusCode) : '-'}</div>
            </div>
            <div style={rowStyle}>
                <div style={labelStyle}>실행 시각 (ISO)</div>
                <div style={blockStyle}>{result.startedAt ?? '-'}</div>
            </div>
            <div style={rowStyle}>
                <div style={labelStyle}>소요 시간</div>
                <div style={blockStyle}>{result.durationMs != null ? `${result.durationMs} ms` : '-'}</div>
            </div>
            <div style={rowStyle}>
                <div style={labelStyle}>에러 메시지</div>
                <div style={blockStyle}>{result.errorMessage ?? '(없음)'}</div>
            </div>
            <div style={rowStyle}>
                <div style={labelStyle}>응답 본문</div>
                <div style={blockStyle}>{formatBody(result.responseBody)}</div>
            </div>
        </div>
    );
}
