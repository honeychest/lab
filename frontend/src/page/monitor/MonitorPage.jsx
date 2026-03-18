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

export default function MonitorPage() {
    const navigate = useNavigate();
    const { snapshot } = useMonitorWebSocket();

    const [allowedIps, setAllowedIps] = useState([]);
    const [allowedLoading, setAllowedLoading] = useState(false);

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

    const business = useMemo(() => ({
        redisQueue: snapshot?.redisQueue ?? null,
        wsConnections: snapshot?.wsConnections ?? null,
        apiErrorRate: snapshot?.apiErrorRate ?? null,
    }), [snapshot]);

    const isMobile = typeof window !== 'undefined' && window.innerWidth <= 768;
    const anyContainerBad = (snapshot?.containers ?? []).some(c => (c?.status ?? '').toLowerCase() !== 'running');

    return (
        <Layout footerCenter={['WebSocket', 'Redis', 'Actuator', 'Nginx', 'React']}>
            <div className={styles.page}>
                <div className={styles.grid}>
                    <section className={styles.main}>
                        <div className={styles.gauges}>
                            <GaugeBar label="CPU" value={snapshot?.cpu ?? null} />
                            <GaugeBar label="RAM" value={snapshot?.ram ?? null} />
                            <GaugeBar label="DISK" value={snapshot?.disk ?? null} />
                        </div>

                        {!isMobile && (
                            <div className={styles.tableBlock}>
                                <AlertHistoryTable />
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
                                        <div className={styles.mobileValue}>{snapshot?.disk == null ? '--' : `${Math.round(snapshot.disk)}%`}</div>
                                    </div>
                                    <div className={styles.mobileCard}>
                                        <div className={styles.mobileLabel}>WS</div>
                                        <div className={styles.mobileValue}>{snapshot?.wsConnections == null ? '--' : snapshot.wsConnections}</div>
                                    </div>
                                </div>
                                <div className={styles.mobileWide}>
                                    <div className={styles.mobileLabel}>Docker</div>
                                    <div className={styles.mobileValue}>
                                        {snapshot == null ? '--' : (anyContainerBad ? '⚠ 이상' : '● 전체 정상')}
                                    </div>
                                </div>
                            </div>
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
            </div>
        </Layout>
    );
}

