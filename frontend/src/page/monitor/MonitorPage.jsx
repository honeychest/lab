// [AGENT] /monitor 메인 페이지 (WS 게이지 + 이력, 모바일 요약)
import { useEffect, useMemo, useState } from 'react';
import Layout from '../../shared/ui/layout/Layout.jsx';
import { useMonitorWebSocket } from '../../hooks/useMonitorWebSocket.js';
import GaugeBar from '../../components/monitor/GaugeBar.jsx';
import AlertHistoryTable from '../../components/monitor/AlertHistoryTable.jsx';
import styles from './MonitorPage.module.css';
import '../../styles/themes/monitor-teal.css';

const fmtGb = (bytes) => {
    const n = Number(bytes);
    if (!Number.isFinite(n) || n <= 0) return '--';
    return `${(n / (1024 ** 3)).toFixed(1)}GB`;
};

const fmtCount = (n) => {
    const v = Number(n);
    if (!Number.isFinite(v) || v < 0) return '--';
    return Math.floor(v).toLocaleString('en-US');
};

const fmtBytes = (bytes) => {
    const n = Number(bytes);
    if (!Number.isFinite(n) || n < 0) return '--';
    if (n < 1024) return `${n.toFixed(0)}B`;
    if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)}KB`;
    if (n < 1024 ** 3) return `${(n / (1024 ** 2)).toFixed(1)}MB`;
    if (n < 1024 ** 4) return `${(n / (1024 ** 3)).toFixed(1)}GB`;
    return `${(n / (1024 ** 4)).toFixed(2)}TB`;
};

const fmtMem = (usedBytes, limitBytes) => {
    const u = Number(usedBytes);
    const l = Number(limitBytes);
    if (!Number.isFinite(u) || u < 0) return '--';
    if (Number.isFinite(l) && l > 0) return `${fmtBytes(u)} / ${fmtBytes(l)}`;
    return fmtBytes(u);
};

const fmtTime = (dt) => {
    if (!dt) return '--:--:--';
    // LocalDateTime 직렬화 형태가 환경에 따라 string/array로 올 수 있어 보정
    let d;
    if (Array.isArray(dt) && dt.length >= 6) {
        const [y, m, day, hh, mm, ss] = dt;
        d = new Date(Number(y), Number(m) - 1, Number(day), Number(hh), Number(mm), Number(ss));
    } else {
        d = new Date(dt);
    }
    if (Number.isNaN(d.getTime())) return '--:--:--';
    return d.toLocaleTimeString('ko-KR', { hour12: false });
};

export default function MonitorPage() {
    const { snapshot } = useMonitorWebSocket();

    const [nowTs, setNowTs] = useState(() => Date.now());

    useEffect(() => {
        const id = window.setInterval(() => setNowTs(Date.now()), 1000);
        return () => window.clearInterval(id);
    }, []);

    const parseDt = (dt) => {
        if (!dt) return null;
        if (Array.isArray(dt) && dt.length >= 6) {
            const [y, m, day, hh, mm, ss] = dt;
            const d = new Date(Number(y), Number(m) - 1, Number(day), Number(hh), Number(mm), Number(ss));
            return Number.isNaN(d.getTime()) ? null : d;
        }
        const d = new Date(dt);
        return Number.isNaN(d.getTime()) ? null : d;
    };

    const fmtAgo = (dt) => {
        const d = parseDt(dt);
        if (!d) return '--';
        const diffSec = Math.max(0, Math.floor((nowTs - d.getTime()) / 1000));
        if (diffSec < 3) return '방금';
        if (diffSec < 60) return `${diffSec}초 전`;
        const diffMin = Math.floor(diffSec / 60);
        if (diffMin < 60) return `${diffMin}분 전`;
        const diffHr = Math.floor(diffMin / 60);
        return `${diffHr}시간 전`;
    };

    const lastUpdatedAt = snapshot?.collectedAt ?? null;
    const hasSnapshot = !!snapshot;

    const business = useMemo(() => ({
        rawAggTradeRows: snapshot?.rawAggTradeRows ?? null,
        rawAggTradeBytes: snapshot?.rawAggTradeBytes ?? null,
        redisQueue: snapshot?.redisQueue ?? null,
        redisKeys: snapshot?.redisKeys ?? [],
        wsConnections: snapshot?.wsConnections ?? null,
        wsMonitorConnections: snapshot?.wsMonitorConnections ?? null,
        wsBinanceConnections: snapshot?.wsBinanceConnections ?? null,
        wsUpbitConnections: snapshot?.wsUpbitConnections ?? null,
        wsCandleConnections: snapshot?.wsCandleConnections ?? null,
        apiErrorRate: snapshot?.apiErrorRate ?? null,
    }), [snapshot]);

    const isMobile = typeof window !== 'undefined' && window.innerWidth <= 768;
    const containers = (snapshot?.containers ?? []).filter(c => (c?.status ?? '').toLowerCase() === 'running');
    const anyContainerBad = containers.some(c => (c?.status ?? '').toLowerCase() !== 'running');
    const dockerSummary = snapshot == null
        ? '--'
        : (containers.length === 0 ? '컨테이너 없음' : (anyContainerBad ? '⚠ 이상' : '● 전체 정상'));

    return (
        <Layout footerCenter={['WebSocket', 'Redis', 'Actuator', 'Nginx', 'React']} enableSupport={false}>
            <div className={styles.page}>
                {!hasSnapshot && (
                    <div className={styles.waitOverlay} aria-live="polite">
                        <div className={styles.waitOverlayBox}>
                            <div className={styles.waitTitle}>
                                데이터 수신중
                                <span className={styles.waitDots} aria-hidden="true">
                                    <span className={styles.waitDot} />
                                    <span className={styles.waitDot} />
                                    <span className={styles.waitDot} />
                                </span>
                            </div>
                        </div>
                    </div>
                )}

                <div className={styles.topRow}>
                    <div className={styles.gauges}>
                        <GaugeBar label="CPU" value={snapshot?.cpu ?? null} />
                        <GaugeBar label="RAM" value={snapshot?.ram ?? null} />
                        <GaugeBar label="DISK" value={snapshot?.disk ?? null} />
                        <div className={styles.updatedChip}>
                            <span className={styles.chipDot} />
                            <span className={styles.chipLabel}>마지막 갱신</span>
                            <span className={styles.chipAgo}>{fmtAgo(lastUpdatedAt)}</span>
                            <span className={`${styles.chipTime} ${styles.mono}`}>{fmtTime(lastUpdatedAt)}</span>
                        </div>
                    </div>
                </div>

                <div className={styles.grid}>
                    <section className={styles.main}>
                        {!isMobile && (
                            <div className={styles.diskMeta}>
                                <span className={styles.diskMetaLabel}>DISK</span>
                                <span className={styles.diskMetaValue}>
                                    여유 {fmtGb(snapshot?.diskFreeBytes)} / 전체 {fmtGb(snapshot?.diskTotalBytes)}
                                </span>
                            </div>
                        )}

                        {!isMobile && (
                            <div className={styles.tableMeta}>
                                <span className={styles.tableMetaLabel}>RawAggTrade</span>
                                <span className={styles.tableMetaValue}>
                                    ROWS(추정) {fmtCount(business.rawAggTradeRows)} · SIZE {fmtBytes(business.rawAggTradeBytes)}
                                </span>
                            </div>
                        )}

                        {isMobile && (
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
                        )}

                        {!isMobile && (
                            <section className={styles.dockerCard}>
                                <div className={styles.dockerHeader}>
                                    <div className={styles.dockerTitle}>Docker</div>
                                    <div className={`${styles.dockerStatus} ${anyContainerBad ? styles.dockerStatusBad : styles.dockerStatusOk}`}>
                                        {dockerSummary}
                                    </div>
                                </div>

                                {containers.length === 0 ? (
                                    <div className={styles.dockerEmpty}>표시할 컨테이너 정보가 없습니다.</div>
                                ) : (
                                    <div className={styles.dockerTable} role="table" aria-label="Docker 컨테이너 상태">
                                        <div className={`${styles.dockerRow} ${styles.dockerHead}`} role="row">
                                            <div className={styles.dockerColName} role="columnheader">이름</div>
                                                <div className={styles.dockerColImage} role="columnheader">이미지</div>
                                                <div className={styles.dockerColCpu} role="columnheader">CPU</div>
                                                <div className={styles.dockerColMem} role="columnheader">MEM</div>
                                            <div className={styles.dockerColStatus} role="columnheader">상태</div>
                                                <div className={styles.dockerColUptime} role="columnheader">Uptime</div>
                                            <div className={styles.dockerColRestarts} role="columnheader">재시작</div>
                                        </div>
                                        {containers.map((c) => {
                                            const status = (c?.status ?? '').toString();
                                            const bad = status.toLowerCase() !== 'running';
                                                const up = c?.uptimeSec == null ? '--' : (c.uptimeSec < 60 ? `${c.uptimeSec}s` : `${Math.floor(c.uptimeSec / 60)}m`);
                                                const cpu = c?.cpuPercent == null ? '--' : `${c.cpuPercent.toFixed(1)}%`;
                                                const mem = fmtMem(c?.memUsedBytes, c?.memLimitBytes);
                                            return (
                                                <div key={c?.name ?? status} className={styles.dockerRow} role="row">
                                                    <div className={`${styles.dockerColName} ${styles.mono}`} role="cell">{c?.name ?? '--'}</div>
                                                        <div className={`${styles.dockerColImage} ${styles.mono}`} role="cell">{c?.image ?? '--'}</div>
                                                        <div className={`${styles.dockerColCpu} ${styles.mono}`} role="cell">{cpu}</div>
                                                        <div className={`${styles.dockerColMem} ${styles.mono}`} role="cell">{mem}</div>
                                                    <div className={styles.dockerColStatus} role="cell">
                                                        <span className={`${styles.dockerBadge} ${bad ? styles.dockerBadgeBad : styles.dockerBadgeOk}`}>
                                                            {status || '--'}
                                                        </span>
                                                    </div>
                                                        <div className={`${styles.dockerColUptime} ${styles.mono}`} role="cell">{up}</div>
                                                    <div className={`${styles.dockerColRestarts} ${styles.mono}`} role="cell">
                                                        {c?.restarts == null ? '--' : c.restarts}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}

                                <div className={styles.dockerDivider} />

                                <div className={styles.dockerSubHeader}>
                                    <div className={styles.dockerSubTitle}>Redis</div>
                                    <div className={styles.dockerSubHint}>Key / Value</div>
                                </div>

                                {business.redisKeys.length === 0 ? (
                                    <div className={styles.dockerEmpty}>표시할 키가 없습니다.</div>
                                ) : (
                                    <>
                                        {(() => {
                                            const telegram = business.redisKeys.find(x => x?.key === 'telegram:leader');
                                            const maxQueue = business.redisKeys.find(x => x?.key === 'config:aggtrade:max-queue-size')?.value;
                                            const threshold = business.redisKeys.find(x => x?.key === 'config:threshold');

                                            const maxQueueNum = Number(maxQueue);
                                            const q = Number(business.redisQueue);
                                            const pct = (Number.isFinite(q) && Number.isFinite(maxQueueNum) && maxQueueNum > 0)
                                                ? Math.min(100, Math.max(0, (q / maxQueueNum) * 100))
                                                : null;

                                            return (
                                                <div className={styles.dockerTable} role="table" aria-label="Redis 키 미리보기">
                                                    <div className={`${styles.dockerRow} ${styles.dockerHead} ${styles.redisRow}`} role="row">
                                                        <div className={styles.redisColKey} role="columnheader">Key</div>
                                                        <div className={styles.redisColValue} role="columnheader">Value</div>
                                                    </div>

                                                    <div className={`${styles.dockerRow} ${styles.redisRow}`} role="row">
                                                        <div className={`${styles.redisColKey} ${styles.mono}`} role="cell">telegram:leader</div>
                                                        <div className={styles.redisColValue} role="cell">
                                                            <div className={styles.redisValueBox}>
                                                                {telegram?.value ?? '—'}
                                                            </div>
                                                        </div>
                                                    </div>

                                                    <div className={`${styles.dockerRow} ${styles.redisRow}`} role="row">
                                                        <div className={`${styles.redisColKey} ${styles.mono}`} role="cell">aggtrade queue</div>
                                                        <div className={styles.redisColValue} role="cell">
                                                            <div className={styles.redisValueBox}>
                                                                {Number.isFinite(q) ? fmtCount(q) : '—'}
                                                                {Number.isFinite(maxQueueNum) ? ` / ${fmtCount(maxQueueNum)}` : ''}
                                                                {pct == null ? '' : ` (${pct.toFixed(1)}%)`}
                                                            </div>
                                                        </div>
                                                    </div>

                                                    <div className={`${styles.dockerRow} ${styles.redisRow}`} role="row">
                                                        <div className={`${styles.redisColKey} ${styles.mono}`} role="cell">config:aggtrade:max-queue-size</div>
                                                        <div className={styles.redisColValue} role="cell">
                                                            <div className={styles.redisValueBox}>
                                                                {maxQueue ?? '—'}
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {threshold && (
                                                        <div className={`${styles.dockerRow} ${styles.redisRow}`} role="row">
                                                            <div className={`${styles.redisColKey} ${styles.mono}`} role="cell">config:threshold</div>
                                                            <div className={styles.redisColValue} role="cell">
                                                                <div className={styles.redisValueBox}>
                                                                    {threshold.value ?? '—'}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })()}
                                    </>
                                )}
                            </section>
                        )}
                    </section>

                    {!isMobile && (
                        <aside className={styles.sidebar}>
                            <div className={styles.sideCard}>
                                <div className={styles.sideTitle}>비즈니스 지표</div>
                                <div className={styles.kv}>
                                    <span>WS 연결</span>
                                    <span className={styles.mono}>{business.wsConnections ?? '--'}</span>
                                </div>
                                <div className={styles.wsBreakdown}>
                                    Monitor {business.wsMonitorConnections ?? 0} · Binance {business.wsBinanceConnections ?? 0} · Upbit {business.wsUpbitConnections ?? 0} · Candle {business.wsCandleConnections ?? 0}
                                </div>
                                <div className={styles.kv}>
                                    <span>API 에러율</span>
                                    <span className={styles.mono}>
                                        {business.apiErrorRate == null ? '--' : `${business.apiErrorRate.toFixed(1)}%`}
                                    </span>
                                </div>
                            </div>
                        </aside>
                    )}
                </div>

                <div className={styles.alertBottom}>
                    <AlertHistoryTable />
                </div>
            </div>
        </Layout>
    );
}

