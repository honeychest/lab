// [AGENT] /monitor 메인 페이지 (WS 게이지 + 이력/허용IP, 모바일 요약)
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import Layout from '../../shared/ui/layout/Layout.jsx';
import { useMonitorWebSocket } from '../../hooks/useMonitorWebSocket.js';
import GaugeBar from '../../components/monitor/GaugeBar.jsx';
import AlertHistoryTable from '../../components/monitor/AlertHistoryTable.jsx';
import styles from './MonitorPage.module.css';
import '../../styles/themes/monitor-teal.css';

const fmtTtl = (ttlSeconds) => {
    const n = Number(ttlSeconds);
    if (!Number.isFinite(n) || n <= 0) return '만료';
    return `${Math.ceil(n / 60)}분 후`;
};

const fmtGb = (bytes) => {
    const n = Number(bytes);
    if (!Number.isFinite(n) || n <= 0) return '--';
    return `${(n / (1024 ** 3)).toFixed(1)}GB`;
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
    const navigate = useNavigate();
    const { snapshot } = useMonitorWebSocket();

    const [allowedIps, setAllowedIps] = useState([]);
    const [allowedLoading, setAllowedLoading] = useState(false);
    const [hasSnapshot, setHasSnapshot] = useState(false);
    const [lastUpdatedAt, setLastUpdatedAt] = useState(null);
    const [nowTs, setNowTs] = useState(() => Date.now());
    const [tick, setTick] = useState(0);

    // Case B: 페이지 마운트 시 보호 API 호출 → 403이면 forbidden
    useEffect(() => {
        axios.get('/api/admin/monitor/ping')
            .catch((e) => {
                if (e?.response?.status === 403) {
                    navigate('/forbidden', { replace: true });
                }
            });
    }, [navigate]);

    const loadAllowed = async () => {
        setAllowedLoading(true);
        try {
            const r = await axios.get('/api/admin/monitor/allowed-ips');
            setAllowedIps(r.data ?? []);
        } catch {
            setAllowedIps([]);
        } finally {
            setAllowedLoading(false);
        }
    };

    useEffect(() => { loadAllowed(); }, []);

    const handleDelete = async (ip) => {
        try {
            await axios.delete(`/api/admin/monitor/allowed-ips/${encodeURIComponent(ip)}`);
        } finally {
            loadAllowed();
        }
    };

    useEffect(() => {
        if (!snapshot) return;
        setHasSnapshot(true);
        setLastUpdatedAt(snapshot?.collectedAt ?? null);
        setTick((t) => t + 1);
    }, [snapshot]);

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

    const business = useMemo(() => ({
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
    const containers = snapshot?.containers ?? [];
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

                <div className={styles.lastUpdated}>
                    <div className={`${styles.updatedChip} ${tick > 0 ? styles.updatedChipPulse : ''}`}>
                        <span className={styles.chipDot} />
                        <span className={styles.chipLabel}>마지막 갱신</span>
                        <span className={styles.chipAgo}>{fmtAgo(lastUpdatedAt)}</span>
                        <span className={`${styles.chipTime} ${styles.mono}`}>{fmtTime(lastUpdatedAt)}</span>
                    </div>
                </div>

                <div className={styles.grid}>
                    <section className={styles.main}>
                        <div className={styles.gauges}>
                            <GaugeBar label="CPU" value={snapshot?.cpu ?? null} />
                            <GaugeBar label="RAM" value={snapshot?.ram ?? null} />
                            <GaugeBar label="DISK" value={snapshot?.disk ?? null} />
                        </div>

                        {!isMobile && (
                            <div className={styles.diskMeta}>
                                <span className={styles.diskMetaLabel}>DISK</span>
                                <span className={styles.diskMetaValue}>
                                    여유 {fmtGb(snapshot?.diskFreeBytes)} / 전체 {fmtGb(snapshot?.diskTotalBytes)}
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
                                            <div className={styles.dockerColStatus} role="columnheader">상태</div>
                                            <div className={styles.dockerColRestarts} role="columnheader">재시작</div>
                                        </div>
                                        {containers.map((c) => {
                                            const status = (c?.status ?? '').toString();
                                            const bad = status.toLowerCase() !== 'running';
                                            return (
                                                <div key={c?.name ?? status} className={styles.dockerRow} role="row">
                                                    <div className={`${styles.dockerColName} ${styles.mono}`} role="cell">{c?.name ?? '--'}</div>
                                                    <div className={styles.dockerColStatus} role="cell">
                                                        <span className={`${styles.dockerBadge} ${bad ? styles.dockerBadgeBad : styles.dockerBadgeOk}`}>
                                                            {status || '--'}
                                                        </span>
                                                    </div>
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
                                    <div className={styles.dockerTable} role="table" aria-label="Redis 키 미리보기">
                                        <div className={`${styles.dockerRow} ${styles.dockerHead} ${styles.redisRow}`} role="row">
                                            <div className={styles.redisColKey} role="columnheader">Key</div>
                                            <div className={styles.redisColValue} role="columnheader">Value</div>
                                        </div>
                                        {business.redisKeys.slice(0, 3).map((k) => (
                                            <div key={`${k?.key ?? ''}`} className={`${styles.dockerRow} ${styles.redisRow}`} role="row">
                                                <div className={`${styles.redisColKey} ${styles.mono}`} role="cell">{k?.key ?? '--'}</div>
                                                <div className={styles.redisColValue} role="cell">
                                                    <div className={styles.redisValueBox}>
                                                        {k?.value ?? '--'}
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </section>
                        )}
                    </section>

                    {!isMobile && (
                        <aside className={styles.sidebar}>
                            <div className={styles.sideCard}>
                                <div className={styles.sideTitle}>비즈니스 지표</div>
                                <div className={styles.kv}>
                                    <span>Redis 큐</span>
                                    <span className={styles.mono}>{business.redisQueue ?? '--'}</span>
                                </div>

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

                            <div className={styles.sideCard}>
                                <div className={styles.sideTitleRow}>
                                    <div className={styles.sideTitle}>허용 IP</div>
                                    <button type="button" className={styles.refresh} onClick={loadAllowed} disabled={allowedLoading}>
                                        새로고침
                                    </button>
                                </div>
                                {allowedIps.length === 0 ? (
                                    <div className={styles.empty}>현재 허용된 IP가 없습니다.</div>
                                ) : (
                                    <ul className={styles.ipList}>
                                        {allowedIps.map((x) => (
                                            <li key={x.ip} className={styles.ipItem}>
                                                <div className={styles.ipLeft}>
                                                    <div className={styles.ip}>{x.ip}</div>
                                                    <div className={styles.ttl}>잔여: {fmtTtl(x.ttlSeconds)}</div>
                                                </div>
                                                <button type="button" className={styles.del} onClick={() => handleDelete(x.ip)}>
                                                    삭제
                                                </button>
                                            </li>
                                        ))}
                                    </ul>
                                )}
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

