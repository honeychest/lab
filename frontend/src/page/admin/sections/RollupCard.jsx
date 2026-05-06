import styles from '../AdminPage.module.css';
import { fmtNum } from '../utils';

export default function RollupCard({ rollup }) {
    const { rFrom, setRFrom, rTo, setRTo, rLoading, rResult, handleRollup } = rollup;
    return (
        <div className={styles.card}>
            <div className={styles.titleRow}>
                <div className={styles.title}>롤업</div>
                <div className={styles.subtitle}>1s → 1m → 5m 수동 실행</div>
            </div>
            <div className={styles.inlineRow}>
                <input className={styles.input} type="datetime-local" value={rFrom} onChange={e => setRFrom(e.target.value)} style={{ flex: 1 }} />
                <input className={styles.input} type="datetime-local" value={rTo} onChange={e => setRTo(e.target.value)} style={{ flex: 1 }} />
                <button
                    type="button"
                    className={`${styles.btn} ${styles.btnActive}`}
                    onClick={handleRollup}
                    disabled={rLoading || !rFrom || !rTo}
                >
                    {rLoading ? '실행 중...' : '롤업 실행'}
                </button>
            </div>
            {rResult && (
                <div className={styles.desc} style={{ color: rResult.ok ? 'var(--monitor-gauge-ok)' : 'var(--monitor-severity-critical)' }}>
                    {rResult.ok
                        ? `완료 — 1m: ${fmtNum(rResult.inserted1m)}건, 5m: ${fmtNum(rResult.inserted5m)}건`
                        : rResult.message}
                </div>
            )}
        </div>
    );
}
