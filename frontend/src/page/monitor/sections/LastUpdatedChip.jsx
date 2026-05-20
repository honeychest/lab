import { useEffect, useState } from 'react';
import styles from '../MonitorPage.module.css';
import { fmtTime, parseDt } from '../utils/formatters.js';

export default function LastUpdatedChip({ collectedAt }) {
    const [nowTs, setNowTs] = useState(() => Date.now());

    useEffect(() => {
        const id = window.setInterval(() => setNowTs(Date.now()), 1000);
        return () => window.clearInterval(id);
    }, []);

    const fmtAgo = (dt) => {
        const d = parseDt(dt);
        if (!d) return '--';
        const diffSec = Math.max(0, Math.floor((nowTs - d.getTime()) / 1000));
        if (diffSec < 1) return '방금';
        if (diffSec < 60) return `${diffSec}초 전`;
        const diffMin = Math.floor(diffSec / 60);
        if (diffMin < 60) return `${diffMin}분 전`;
        const diffHr = Math.floor(diffMin / 60);
        return `${diffHr}시간 전`;
    };

    return (
        <div className={styles.updatedChip}>
            <span className={styles.chipDot} />
            <span className={styles.chipLabel}>마지막 갱신</span>
            <span className={styles.chipAgo}>{fmtAgo(collectedAt)}</span>
            <span className={`${styles.chipTime} ${styles.mono}`}>{fmtTime(nowTs)}</span>
        </div>
    );
}
