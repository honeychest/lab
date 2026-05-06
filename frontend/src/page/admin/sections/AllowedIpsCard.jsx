import styles from '../AdminPage.module.css';
import { fmtTtl } from '../utils';

export default function AllowedIpsCard({ allowed }) {
    const { allowedIps, allowedLoading, allowedError, loadAllowedIps, handleDeleteAllowedIp } = allowed;
    return (
        <div className={styles.card}>
            <div className={styles.titleRow}>
                <div className={styles.title}>허용 IP</div>
                <button
                    type="button"
                    className={`${styles.btn} ${styles.btnActive}`}
                    onClick={loadAllowedIps}
                    disabled={allowedLoading}
                    style={{ marginLeft: 'auto' }}
                >
                    {allowedLoading ? '새로고침 중...' : '새로고침'}
                </button>
            </div>
            {allowedError && (
                <div className={styles.muted} style={{ color: 'var(--monitor-severity-critical)' }}>
                    {allowedError}
                </div>
            )}
            {!allowedLoading && !allowedError && allowedIps.length === 0 && (
                <div className={styles.muted}>현재 허용된 IP가 없습니다.</div>
            )}
            {!allowedLoading && allowedIps.length > 0 && (
                <ul className={styles.ipList}>
                    {allowedIps.map((x) => (
                        <li key={x.ip} className={styles.ipItem}>
                            <div className={styles.ipLeft}>
                                <div className={styles.ip}>{x.ip}</div>
                                <div className={styles.ttl}>잔여: {fmtTtl(x.ttlSeconds)}</div>
                            </div>
                            <button
                                type="button"
                                className={styles.del}
                                onClick={() => handleDeleteAllowedIp(x.ip)}
                                disabled={allowedLoading}
                            >
                                삭제
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
