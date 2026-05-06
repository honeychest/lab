import styles from '../AuthTestPage.module.css';

export default function ArchiveForm({ actions }) {
    const {
        archiveFrom, setArchiveFrom, archiveTo, setArchiveTo,
        archiveCount, setArchiveCount,
        busy, runningAction,
        handleArchiveCount, handleArchiveRun, handleArchiveUpload,
    } = actions;

    const rangeReady = archiveFrom && archiveTo && archiveFrom < archiveTo;
    const runDimmed = archiveCount == null || archiveCount === 0;

    return (
        <>
            <div className={styles.label}>S3 아카이빙 테스트</div>
            <div className={styles.fieldGroup}>
                <div className={styles.subLabel}>시작 (from)</div>
                <input
                    className={styles.input}
                    type="datetime-local"
                    value={archiveFrom}
                    onChange={e => { setArchiveFrom(e.target.value); setArchiveCount(null); }}
                />
            </div>
            <div className={styles.fieldGroup}>
                <div className={styles.subLabel}>종료 (to, exclusive)</div>
                <input
                    className={styles.input}
                    type="datetime-local"
                    value={archiveTo}
                    onChange={e => { setArchiveTo(e.target.value); setArchiveCount(null); }}
                />
            </div>
            <button className={styles.primaryBtn} onClick={handleArchiveCount} disabled={busy || !rangeReady}>
                {runningAction === 'archiveCount' ? '조회 중…' : '건수 조회'}
            </button>
            {archiveCount != null && (
                <div className={styles.countLine}>
                    대상: <strong>{archiveCount.toLocaleString()}건</strong>
                </div>
            )}
            <button
                className={`${styles.primaryBtn} ${runDimmed ? styles.primaryBtnDimmed : ''}`}
                onClick={handleArchiveRun}
                disabled={busy || runDimmed}
            >
                {runningAction === 'archiveRun' ? '실행 중…' : '실행 (업로드+삭제)'}
            </button>
            <button
                className={`${styles.primaryBtn} ${runDimmed ? styles.primaryBtnDimmed : ''}`}
                onClick={handleArchiveUpload}
                disabled={busy || runDimmed}
            >
                {runningAction === 'archiveUpload' ? '실행 중…' : '업로드만 (삭제 없음)'}
            </button>
        </>
    );
}
