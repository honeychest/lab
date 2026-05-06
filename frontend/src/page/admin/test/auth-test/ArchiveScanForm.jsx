import styles from '../AuthTestPage.module.css';

export default function ArchiveScanForm({ actions }) {
    const { busy, runningAction, handleScanPreview, handleScanRun } = actions;
    return (
        <>
            <div className={styles.label}>S3 스캔 테스트</div>
            <button className={styles.primaryBtn} onClick={handleScanPreview} disabled={busy}>
                {runningAction === 'scanPreview' ? '조회 중…' : 'S3 파일 미리보기'}
            </button>
            <button
                className={`${styles.primaryBtn} ${styles.warningBtn}`}
                onClick={handleScanRun}
                disabled={busy}
            >
                {runningAction === 'scanRun' ? '스캔 중…' : 'DB 초기화 스캔 (1회용)'}
            </button>
        </>
    );
}
