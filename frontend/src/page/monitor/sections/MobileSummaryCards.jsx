import styles from '../MonitorPage.module.css';
import { fmtGb } from '../utils/formatters.js';

export default function MobileSummaryCards({ snapshot, dockerSummary }) {
    return (
        <div className={styles.mobileCards}>
            <div className={styles.mobileRow}>
                <div className={styles.mobileCard}>
                    <div className={styles.mobileLabel}>CPU</div>
                    <div className={styles.mobileValue}>{snapshot?.cpu == null ? '--' : `${Math.round(snapshot.cpu)}%`}</div>
                </div>
                <div className={styles.mobileCard}>
                    <div className={styles.mobileLabel}>RAM</div>
                    <div className={styles.mobileValue}>{snapshot?.ram == null ? '--' : `${Math.round(snapshot.ram)}%`}</div>
                </div>
            </div>
            <div className={styles.mobileRow}>
                <div className={styles.mobileCard}>
                    <div className={styles.mobileLabel}>DISK</div>
                    <div className={styles.mobileValue}>
                        {snapshot?.disk == null ? '--' : `${Math.round(snapshot.disk)}%`}
                    </div>
                    <div className={styles.mobileSub}>
                        여유 {fmtGb(snapshot?.diskFreeBytes)}
                    </div>
                </div>
                <div className={styles.mobileCard}>
                    <div className={styles.mobileLabel}>WS</div>
                    <div className={styles.mobileValue}>{snapshot?.wsConnections == null ? '--' : snapshot.wsConnections}</div>
                </div>
            </div>
            <div className={styles.mobileWide}>
                <div className={styles.mobileLabel}>Docker</div>
                <div className={styles.mobileValue}>
                    {dockerSummary}
                </div>
            </div>
        </div>
    );
}
