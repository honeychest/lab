import { useState } from 'react';
import { login, fetchCookieDebug } from '@/api/adminTest/auth.js';
import { fetchArchiveCount, runArchive } from '@/api/adminTest/archive.js';
import { logApiCall } from './shared/logApiCall.js';
import ApiCallLogPanel from './shared/ApiCallLogPanel.jsx';

const FEATURES = [
    { key: 'login', label: '로그인' },
    { key: 'cookieSnapshot', label: 'Cookie Snapshot' },
    { key: 'archive', label: 'S3 아카이빙' },
];

const containerStyle = {
    display: 'grid',
    gridTemplateColumns: '140px 1fr 1fr',
    gap: '12px',
    height: 'calc(100vh - 220px)',
    color: 'var(--monitor-text-primary)',
};

const colStyle = {
    border: '1px solid var(--monitor-border)',
    background: 'var(--monitor-card-bg)',
    padding: '16px',
    overflowY: 'auto',
    display: 'grid',
    alignContent: 'start',
    gap: '10px',
};

const featureBtnStyle = (active) => ({
    padding: '12px 16px',
    border: '1px solid var(--monitor-border)',
    background: active ? 'var(--monitor-primary)' : 'var(--monitor-sidebar-bg)',
    color: active ? '#ffffff' : 'var(--monitor-text-primary)',
    cursor: 'pointer',
    textAlign: 'left',
    width: '100%',
});

const inputStyle = {
    width: '100%',
    padding: '10px 12px',
    border: '1px solid var(--monitor-border)',
    background: 'var(--monitor-sidebar-bg)',
    color: 'var(--monitor-text-primary)',
    outline: 'none',
    boxSizing: 'border-box',
};

const primaryBtnStyle = {
    padding: '12px 16px',
    border: '1px solid var(--monitor-border)',
    background: 'var(--monitor-primary)',
    color: '#ffffff',
    cursor: 'pointer',
    width: '100%',
};

const labelStyle = {
    fontSize: '13px',
    fontWeight: 700,
    color: 'var(--monitor-text-secondary)',
};

function ResultPanel({ result, featureKey }) {
    const statusColor = result.ok ? 'var(--monitor-primary)' : 'var(--monitor-severity-critical)';

    if (featureKey === 'login') {
        return (
            <div style={{ display: 'grid', gap: '8px', fontSize: '13px' }}>
                <div style={{ fontWeight: 700, color: statusColor }}>
                    {result.ok ? '로그인 성공' : '로그인 실패'}
                </div>
                <div>상태 코드: {result.statusCode ?? '-'}</div>
                <div>소요 시간: {result.durationMs != null ? `${result.durationMs} ms` : '-'}</div>
                {!result.ok && <div style={{ color: statusColor }}>오류: {result.errorMessage ?? '-'}</div>}
            </div>
        );
    }

    if (featureKey === 'archive') {
        const body = result.responseBody;
        // 오류
        if (!result.ok) {
            return (
                <div style={{ fontSize: '13px', color: 'var(--monitor-severity-critical)' }}>
                    오류: {result.errorMessage ?? '알 수 없는 오류'}
                </div>
            );
        }
        // 건수 조회 결과
        if (result._isCount) {
            return (
                <div style={{ display: 'grid', gap: '6px', fontSize: '13px' }}>
                    <div style={{ fontWeight: 700, color: statusColor }}>건수 조회 완료</div>
                    <div>대상 건수: <strong>{body?.count?.toLocaleString()}건</strong></div>
                </div>
            );
        }
        // 실행 결과
        if (body) {
            const rows = [
                ['상태',        body.success ? (body.skipped ? '스킵 (데이터 없음)' : '성공') : '실패'],
                ['범위',        body.rangeLabel ?? '-'],
                ['S3 키',       body.s3Key ?? '-'],
                ['대상 건수',   body.totalCount?.toLocaleString() ?? '-'],
                ['삭제 건수',   body.deletedCount?.toLocaleString() ?? '-'],
                ['파일 크기',   body.fileSizeBytes != null ? `${(body.fileSizeBytes / 1024).toFixed(1)} KB` : '-'],
                ['건수 조회',   body.countElapsedMs != null ? `${body.countElapsedMs} ms` : '-'],
                ['S3 업로드',   body.uploadElapsedMs != null ? `${body.uploadElapsedMs} ms` : '-'],
                ['DB 삭제',     body.deleteElapsedMs != null ? `${body.deleteElapsedMs} ms` : '-'],
                ['전체 소요',   body.totalElapsedMs != null ? `${body.totalElapsedMs} ms` : '-'],
                ['건당 평균',   body.perRecordMs != null ? `${body.perRecordMs} ms` : '-'],
                ['오류',        body.errorMessage ?? '-'],
            ];
            return (
                <div style={{ display: 'grid', gap: '6px', fontSize: '13px' }}>
                    <div style={{ fontWeight: 700, color: statusColor }}>실행 결과</div>
                    {rows.map(([label, value]) => (
                        <div key={label} style={{ display: 'grid', gridTemplateColumns: '90px 1fr', gap: '8px' }}>
                            <span style={{ color: 'var(--monitor-text-secondary)' }}>{label}</span>
                            <span>{value}</span>
                        </div>
                    ))}
                </div>
            );
        }
    }

    return <ApiCallLogPanel result={result} title="결과" />;
}

export default function AuthTestPage() {
    const [selected, setSelected]   = useState('login');
    const [email, setEmail]         = useState('');
    const [password, setPassword]   = useState('');
    const [archiveFrom, setArchiveFrom] = useState('');
    const [archiveTo, setArchiveTo]     = useState('');
    const [archiveCount, setArchiveCount] = useState(null); // 건수 조회 결과
    const [runningAction, setRunningAction] = useState(null);
    const [logs, setLogs]           = useState({});

    const busy = runningAction != null;
    const patchLog = (key, log) => setLogs(prev => ({ ...prev, [key]: log }));

    const handleLogin = async (e) => {
        e.preventDefault();
        if (busy || !email.trim()) return;
        setRunningAction('login');
        const log = await logApiCall('POST /api/auth/login', () => login({ email: email.trim(), password }));
        patchLog('login', log);
        setRunningAction(null);
    };

    const handleCookieSnapshot = async () => {
        if (busy) return;
        setRunningAction('cookieSnapshot');
        const log = await logApiCall('GET /api/admin/test/auth/debug/cookie-info', fetchCookieDebug);
        patchLog('cookieSnapshot', log);
        setRunningAction(null);
    };

    // datetime-local 값을 Unix ms로 변환
    const toMs = (datetimeLocal) => new Date(datetimeLocal).getTime();

    const handleArchiveCount = async () => {
        if (busy || !archiveFrom || !archiveTo) return;
        setArchiveCount(null);
        setRunningAction('archiveCount');
        const log = await logApiCall('POST /api/admin/archive/count', () => fetchArchiveCount(toMs(archiveFrom), toMs(archiveTo)));
        patchLog('archive', { ...log, _isCount: true }); // 건수 조회임을 구분
        if (log.ok && log.responseBody?.count != null) {
            setArchiveCount(log.responseBody.count);
        }
        setRunningAction(null);
    };

    const handleArchiveRun = async () => {
        if (busy || archiveCount == null) return;
        setRunningAction('archiveRun');
        const log = await logApiCall('POST /api/admin/archive/run', () => runArchive(toMs(archiveFrom), toMs(archiveTo)));
        patchLog('archive', log);
        setArchiveCount(null); // 실행 후 건수 초기화
        setRunningAction(null);
    };

    const renderForm = () => {
        if (selected === 'login') {
            return (
                <>
                    <div style={labelStyle}>로그인 테스트</div>
                    <form onSubmit={handleLogin} style={{ display: 'grid', gap: '10px' }}>
                        <input style={inputStyle} type="email" placeholder="email"
                               value={email} onChange={e => setEmail(e.target.value)} autoComplete="username" />
                        <input style={inputStyle} type="password" placeholder="password"
                               value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" />
                        <button style={primaryBtnStyle} type="submit" disabled={busy || !email.trim()}>
                            {runningAction === 'login' ? '요청 중…' : 'Login'}
                        </button>
                    </form>
                </>
            );
        }
        if (selected === 'cookieSnapshot') {
            return (
                <>
                    <div style={labelStyle}>현재 쿠키 상태 조회</div>
                    <button style={primaryBtnStyle} onClick={handleCookieSnapshot} disabled={busy}>
                        {runningAction === 'cookieSnapshot' ? '조회 중…' : 'Cookie Snapshot'}
                    </button>
                </>
            );
        }
        if (selected === 'archive') {
            const rangeReady = archiveFrom && archiveTo && archiveFrom < archiveTo;
            return (
                <>
                    <div style={labelStyle}>S3 아카이빙 테스트</div>
                    <div style={{ display: 'grid', gap: '6px' }}>
                        <div style={{ fontSize: '12px', color: 'var(--monitor-text-secondary)' }}>시작 (from)</div>
                        <input style={inputStyle} type="datetime-local"
                               value={archiveFrom} onChange={e => { setArchiveFrom(e.target.value); setArchiveCount(null); }} />
                    </div>
                    <div style={{ display: 'grid', gap: '6px' }}>
                        <div style={{ fontSize: '12px', color: 'var(--monitor-text-secondary)' }}>종료 (to, exclusive)</div>
                        <input style={inputStyle} type="datetime-local"
                               value={archiveTo} onChange={e => { setArchiveTo(e.target.value); setArchiveCount(null); }} />
                    </div>
                    <button style={primaryBtnStyle} onClick={handleArchiveCount} disabled={busy || !rangeReady}>
                        {runningAction === 'archiveCount' ? '조회 중…' : '건수 조회'}
                    </button>
                    {archiveCount != null && (
                        <div style={{ fontSize: '13px', color: 'var(--monitor-text-primary)' }}>
                            대상: <strong>{archiveCount.toLocaleString()}건</strong>
                        </div>
                    )}
                    <button
                        style={{ ...primaryBtnStyle, opacity: archiveCount == null || archiveCount === 0 ? 0.4 : 1 }}
                        onClick={handleArchiveRun}
                        disabled={busy || archiveCount == null || archiveCount === 0}
                    >
                        {runningAction === 'archiveRun' ? '실행 중…' : '실행'}
                    </button>
                </>
            );
        }
        return null;
    };

    return (
        <div style={containerStyle}>
            {/* 1열: 기능 목록 */}
            <div style={colStyle}>
                {FEATURES.map(f => (
                    <button key={f.key} style={featureBtnStyle(selected === f.key)}
                            onClick={() => setSelected(f.key)}>
                        {f.label}
                    </button>
                ))}
            </div>

            {/* 2열: 입력 폼 */}
            <div style={colStyle}>
                {renderForm()}
            </div>

            {/* 3열: 결과 */}
            <div style={colStyle}>
                {logs[selected] ? <ResultPanel result={logs[selected]} featureKey={selected} /> : (
                    <div style={{ color: 'var(--monitor-text-secondary)', fontSize: '13px' }}>결과가 여기에 표시됩니다.</div>
                )}
            </div>
        </div>
    );
}
