import ApiCallLogPanel from '../shared/ApiCallLogPanel.jsx';

export default function ResultPanel({ result, featureKey }) {
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
        if (!result.ok) {
            return (
                <div style={{ fontSize: '13px', color: 'var(--monitor-severity-critical)' }}>
                    오류: {result.errorMessage ?? '알 수 없는 오류'}
                </div>
            );
        }
        if (result._isCount) {
            return (
                <div style={{ display: 'grid', gap: '6px', fontSize: '13px' }}>
                    <div style={{ fontWeight: 700, color: statusColor }}>건수 조회 완료</div>
                    <div>대상 건수: <strong>{body?.count?.toLocaleString()}건</strong></div>
                </div>
            );
        }
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

    if (featureKey === 'archiveScan') {
        const body = result.responseBody;
        if (!result.ok) {
            return (
                <div style={{ fontSize: '13px', color: 'var(--monitor-severity-critical)' }}>
                    오류: {result.errorMessage ?? '알 수 없는 오류'}
                </div>
            );
        }
        if (body?.inserted != null) {
            return (
                <div style={{ display: 'grid', gap: '6px', fontSize: '13px' }}>
                    <div style={{ fontWeight: 700, color: 'var(--monitor-primary)' }}>스캔 완료</div>
                    <div>삽입: <strong>{body.inserted}건</strong></div>
                    <div>스킵: <strong>{body.skipped}건</strong></div>
                </div>
            );
        }
        if (Array.isArray(body)) {
            return (
                <div style={{ display: 'grid', gap: '8px', fontSize: '12px' }}>
                    <div style={{ fontWeight: 700, color: 'var(--monitor-primary)' }}>S3 파일 {body.length}개</div>
                    {body.map(f => (
                        <div key={f.s3Key} style={{ borderTop: '1px solid var(--monitor-border)', paddingTop: '6px', display: 'grid', gap: '2px' }}>
                            <div style={{ color: 'var(--monitor-text-secondary)', wordBreak: 'break-all' }}>{f.s3Key}</div>
                            <div>범위: {f.rangeStart?.substring(0, 19)} ~ {f.rangeEnd?.substring(0, 19)}</div>
                            <div>크기: {f.fileSizeBytes != null ? `${(f.fileSizeBytes / 1024).toFixed(1)} KB` : '-'}</div>
                            <div>complete: <strong style={{ color: f.complete === 'Y' ? 'var(--monitor-primary)' : f.complete === 'N' ? 'var(--monitor-severity-warning)' : 'var(--monitor-text-secondary)' }}>{f.complete ?? '미등록'}</strong></div>
                        </div>
                    ))}
                </div>
            );
        }
    }

    return <ApiCallLogPanel result={result} title="결과" />;
}
