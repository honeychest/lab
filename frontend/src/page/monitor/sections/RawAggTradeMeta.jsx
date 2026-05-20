import styles from '../MonitorPage.module.css';
import { fmtBytes, fmtCount, fmtGb } from '../utils/formatters.js';

export default function RawAggTradeMeta({ snapshot }) {
    return (
        <div className={styles.tableMeta}>
            <span className={styles.tableMetaLabel}>RawAggTrade</span>
            <span className={styles.tableMetaValue}>
                ROWS(스냅샷) {fmtCount(snapshot?.rawAggTradeRows)} · SIZE {fmtBytes(snapshot?.rawAggTradeBytes)} · S3이관 {fmtCount(snapshot?.rawAggTradeS3Rows)} · {fmtGb(snapshot?.rawAggTradeS3Bytes)}
            </span>
        </div>
    );
}
