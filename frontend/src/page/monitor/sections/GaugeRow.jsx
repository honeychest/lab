import GaugeBar from '../../../components/monitor/GaugeBar.jsx';
import LastUpdatedChip from './LastUpdatedChip.jsx';
import styles from '../MonitorPage.module.css';

export default function GaugeRow({ snapshot, collectedAt }) {
    return (
        <div className={styles.topRow}>
            <div className={styles.gauges}>
                <GaugeBar label="CPU (AWS m7i-flex.large)" value={snapshot?.cpu ?? null} />
                <GaugeBar label="RAM (AWS 8 GB)" value={snapshot?.ram ?? null} />
                <GaugeBar label="DISK" value={snapshot?.disk ?? null} />
                <LastUpdatedChip collectedAt={collectedAt} />
            </div>
        </div>
    );
}
