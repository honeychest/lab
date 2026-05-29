// [AGENT] 업스트림 피드 freshness 신호등 (snapshot.feeds 렌더)
import styles from '../MonitorPage.module.css';

const STATUS_META = {
    UP:    { cls: 'feedBadgeUp',    label: '🟢 UP' },
    STALE: { cls: 'feedBadgeStale', label: '🟡 STALE' },
    DOWN:  { cls: 'feedBadgeDown',  label: '🔴 DOWN' },
};

export default function FeedHealthCard({ feeds }) {
    const list = feeds ?? [];
    const anyBad = list.some(f => f?.status === 'DOWN' || f?.status === 'STALE');
    const summary = list.length === 0 ? '--' : (anyBad ? '⚠ 이상' : '● 전체 정상');

    return (
        <section className={styles.dockerCard}>
            <div className={styles.dockerHeader}>
                <div className={styles.dockerTitle}>
                    피드 상태 <span style={{ fontSize: '0.75rem', opacity: 0.6 }}>(업스트림 수신)</span>
                </div>
                <div className={`${styles.dockerStatus} ${anyBad ? styles.dockerStatusBad : styles.dockerStatusOk}`}>
                    {summary}
                </div>
            </div>

            {list.length === 0 ? (
                <div className={styles.dockerEmpty}>표시할 피드가 없습니다.</div>
            ) : (
                <div className={styles.dockerTable} role="table" aria-label="업스트림 피드 상태">
                    {list.map((f) => {
                        const meta = STATUS_META[f?.status] ?? { cls: null, label: f?.status ?? '--' };
                        const ago = f?.secondsSinceLastMessage == null
                            ? '수신 없음'
                            : `${f.secondsSinceLastMessage}초 전`;
                        return (
                            <div key={f?.feedId ?? meta.label} className={styles.feedRow} role="row">
                                <div className={`${styles.feedColName} ${styles.mono}`} role="cell">{f?.feedId ?? '--'}</div>
                                <div className={`${styles.feedColAgo} ${styles.mono}`} role="cell">{ago}</div>
                                <div className={styles.feedColStatus} role="cell">
                                    <span className={`${styles.dockerBadge} ${meta.cls ? styles[meta.cls] : ''}`}>
                                        {meta.label}
                                    </span>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </section>
    );
}
