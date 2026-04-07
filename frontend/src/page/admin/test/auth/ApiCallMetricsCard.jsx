import { subCardStyle } from './authTestStyles.js';

function formatStatus(result) {
    if (!result) return '-';
    if (result.ok) return 'OK';
    return 'ERROR';
}

function formatSteps(steps) {
    if (!Array.isArray(steps) || steps.length === 0) return null;
    return steps.map((s) => (
        <li key={s.name} style={{ marginBottom: '4px' }}>
            <span style={{ fontWeight: 600 }}>{s.name}</span>
            {' '}
            {s.ok ? 'OK' : 'FAIL'}
            {s.statusCode != null ? ` · ${s.statusCode}` : ''}
            {s.errorMessage ? ` · ${s.errorMessage}` : ''}
        </li>
    ));
}

export default function ApiCallMetricsCard({ title, result }) {
    const steps = result?.responseBody?.steps;

    return (
        <div style={subCardStyle}>
            <div style={{ fontWeight: 700 }}>{title}</div>
            <div>결과: {formatStatus(result)}</div>
            <div>상태 코드: {result?.statusCode ?? '-'}</div>
            <div>소요 시간: {result?.durationMs != null ? `${result.durationMs} ms` : '-'}</div>
            <div>시작 시각: {result?.startedAt ?? '-'}</div>
            <div style={{ opacity: 0.85 }}>
                요청: {result?.requestSummary ?? '-'}
            </div>
            {steps && (
                <ul style={{ margin: '6px 0 0', paddingLeft: '18px', fontSize: '12px' }}>
                    {formatSteps(steps)}
                </ul>
            )}
            {!result?.ok && (
                <div style={{ color: 'var(--monitor-severity-critical)' }}>
                    오류: {result?.errorMessage ?? '(없음)'}
                </div>
            )}
        </div>
    );
}
