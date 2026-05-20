import styles from '../MonitorPage.module.css';
import { fmtGb } from '../utils/formatters.js';

export default function DiskMeta({ snapshot }) {
    return (
        <div className={styles.diskMeta}>
            <span className={styles.diskMetaLabel}>DISK</span>
            <span className={styles.diskMetaValue}>
                여유 {fmtGb(snapshot?.diskFreeBytes)} / 전체 {fmtGb(snapshot?.diskTotalBytes)}
            </span>
        </div>
    );
}
