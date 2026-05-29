// [AGENT] WS 사이드바: 업스트림 피드 상태(3줄) + 뉴스피드
import { useMemo, useRef } from 'react';
import NewsFeed from '../../../components/monitor/NewsFeed.jsx';
import styles from '../MonitorPage.module.css';

const STATUS_META = {
    UP:    { cls: 'feedBadgeUp',    label: '🟢 UP' },
    STALE: { cls: 'feedBadgeStale', label: '🟡 STALE' },
    DOWN:  { cls: 'feedBadgeDown',  label: '🔴 DOWN' },
};

const FEED_LABEL = {
    'binance-ticker':   '바이낸스 시세',
    'upbit':            '업비트 시세',
    'binance-aggTrade': '바이낸스 체결',
};

// 표시 순서 (줄맞춤). 목록에 없는 feedId는 뒤로.
const FEED_ORDER = ['binance-aggTrade', 'binance-ticker', 'upbit'];
const feedRank = (id) => {
    const i = FEED_ORDER.indexOf(id);
    return i === -1 ? FEED_ORDER.length : i;
};

function fmtClock(ms) {
    if (ms == null) return null;
    const d = new Date(ms);
    const p = (n) => String(n).padStart(2, '0');
    return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

export default function WsSidebar({ snapshot, maxHeight }) {
    const feeds = [...(snapshot?.feeds ?? [])].sort((a, b) => feedRank(a?.feedId) - feedRank(b?.feedId));
    const anyBad = feeds.some(f => f?.status === 'DOWN' || f?.status === 'STALE');
    const summary = feeds.length === 0 ? '--' : (anyBad ? '⚠ 이상' : '● 전체 정상');

    // 직전 스냅샷 대비 수신 건수(델타). 누적값을 ref에 기억해 현재-직전으로 계산.
    const prevCounts = useRef({});
    const collectedAt = snapshot?.collectedAt;
    const deltas = useMemo(() => {
        const nextCounts = {};
        const nextDeltas = {};
        for (const f of (snapshot?.feeds ?? [])) {
            const id = f?.feedId;
            if (!id) continue;
            const cur = Number(f?.receivedCount ?? 0);
            const prev = prevCounts.current[id];
            nextDeltas[id] = prev == null ? null : Math.max(0, cur - prev);
            nextCounts[id] = cur;
        }
        prevCounts.current = nextCounts;
        return nextDeltas;
        // collectedAt 변경(=새 스냅샷)마다 델타 재계산
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [collectedAt]);

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
                        const clock = fmtClock(f?.lastMessageAtEpochMs);
                        const delta = deltas[f?.feedId];
                        const info = clock == null
                            ? '수신 없음'
                            : `${clock}${delta == null ? '' : ` ${delta.toLocaleString()}건`}`;
                        return (
                            <div key={f?.feedId ?? meta.label} className={styles.kv}>
                                <span className={styles.feedName}>{FEED_LABEL[f?.feedId] ?? f?.feedId ?? '--'}</span>
                                <span className={styles.feedRight}>
                                    <span className={styles.feedAgo}>{info}</span>
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
