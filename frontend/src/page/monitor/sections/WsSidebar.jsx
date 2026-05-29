// [AGENT] WS 사이드바: 업스트림 피드 상태(3줄) + 뉴스피드
import NewsFeed from '../../../components/monitor/NewsFeed.jsx';
import styles from '../MonitorPage.module.css';

const STATUS_META = {
    UP:    { cls: 'feedBadgeUp',    label: '🟢 UP' },
    STALE: { cls: 'feedBadgeStale', label: '🟡 STALE' },
    DOWN:  { cls: 'feedBadgeDown',  label: '🔴 DOWN' },
};

export default function WsSidebar({ snapshot, maxHeight }) {
    const feeds = snapshot?.feeds ?? [];
    const anyBad = feeds.some(f => f?.status === 'DOWN' || f?.status === 'STALE');
    const summary = feeds.length === 0 ? '--' : (anyBad ? '⚠ 이상' : '● 전체 정상');

    return (
        <aside className={styles.sidebar} style={maxHeight ? { maxHeight } : undefined}>
            <div className={styles.sideCard}>
                <div className={styles.sideTitleRow}>
                    <span className={styles.sideTitle}>피드 상태</span>
                    <span className={`${styles.dockerStatus} ${anyBad ? styles.dockerStatusBad : styles.dockerStatusOk}`}>
                        {summary}
                    </span>
                </div>

                {feeds.length === 0 ? (
                    <div className={styles.empty}>표시할 피드가 없습니다.</div>
                ) : (
                    feeds.map((f) => {
                        const meta = STATUS_META[f?.status] ?? { cls: null, label: f?.status ?? '--' };
                        const ago = f?.secondsSinceLastMessage == null
                            ? '수신 없음'
                            : `${f.secondsSinceLastMessage}초 전`;
                        return (
                            <div key={f?.feedId ?? meta.label} className={styles.kv}>
                                <span className={`${styles.feedName} ${styles.mono}`}>{f?.feedId ?? '--'}</span>
                                <span className={styles.feedRight}>
                                    <span className={styles.feedAgo}>{ago}</span>
                                    <span className={`${styles.dockerBadge} ${meta.cls ? styles[meta.cls] : ''}`}>
                                        {meta.label}
                                    </span>
                                </span>
                            </div>
                        );
                    })
                )}
            </div>
            <NewsFeed />
        </aside>
    );
}
