import styles from '../AuthTestPage.module.css';

export default function CookieSnapshotForm({ actions }) {
    const { busy, runningAction, handleCookieSnapshot } = actions;
    return (
        <>
            <div className={styles.label}>현재 쿠키 상태 조회</div>
            <button className={styles.primaryBtn} onClick={handleCookieSnapshot} disabled={busy}>
                {runningAction === 'cookieSnapshot' ? '조회 중…' : 'Cookie Snapshot'}
            </button>
        </>
    );
}
