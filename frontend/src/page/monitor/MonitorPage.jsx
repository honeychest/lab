// [AGENT] /monitor 메인 페이지 (WS 게이지 + 이력, 모바일 요약)
import Layout from '../../shared/ui/layout/Layout.jsx';
import AlertHistoryTable from '../../components/monitor/AlertHistoryTable.jsx';
import { useMonitorWebSocket } from './hooks/useMonitorWebSocket.js';
import { useIsMobile } from './hooks/useIsMobile.js';
import { useElementHeight } from './hooks/useElementHeight.js';
import { useLockMainScroll } from './hooks/useLockMainScroll.js';
import GaugeRow from './sections/GaugeRow.jsx';
import DiskMeta from './sections/DiskMeta.jsx';
import RawAggTradeMeta from './sections/RawAggTradeMeta.jsx';
import DockerCard from './sections/DockerCard.jsx';
import MobileSummaryCards from './sections/MobileSummaryCards.jsx';
import WsSidebar from './sections/WsSidebar.jsx';
import WaitOverlay from './sections/WaitOverlay.jsx';
import styles from './MonitorPage.module.css';
import '../../styles/themes/monitor-teal.css';

const FOOTER = ['WebSocket', 'Redis', 'Actuator', 'Micrometer', 'RSS'];

export default function MonitorPage() {
    const { snapshot } = useMonitorWebSocket();
    const isMobile = useIsMobile();
    const [mainRef, mainHeight] = useElementHeight();
    useLockMainScroll();

    const hasSnapshot = !!snapshot;
    const containers = (snapshot?.containers ?? []).filter(c => (c?.status ?? '').toLowerCase() === 'running');
    const anyContainerBad = containers.some(c => (c?.status ?? '').toLowerCase() !== 'running');
    const dockerSummary = snapshot == null
        ? '--'
        : (containers.length === 0 ? '컨테이너 없음' : (anyContainerBad ? '⚠ 이상' : '● 전체 정상'));

    return (
        <Layout footerCenter={FOOTER} enableSupport={false}>
            <div className={styles.page}>
                {!hasSnapshot && <WaitOverlay />}

                <GaugeRow snapshot={snapshot} collectedAt={snapshot?.collectedAt ?? null} />

                <div className={styles.grid}>
                    <section className={styles.main} ref={mainRef}>
                        {!isMobile && <DiskMeta snapshot={snapshot} />}
                        {!isMobile && <RawAggTradeMeta snapshot={snapshot} />}
                        {isMobile && <MobileSummaryCards snapshot={snapshot} dockerSummary={dockerSummary} />}
                        {!isMobile && (
                            <DockerCard
                                containers={containers}
                                anyContainerBad={anyContainerBad}
                                dockerSummary={dockerSummary}
                                redisKeys={snapshot?.redisKeys ?? []}
                                redisQueue={snapshot?.redisQueue ?? null}
                            />
                        )}
                    </section>

                    {!isMobile && <WsSidebar snapshot={snapshot} maxHeight={mainHeight} />}
                </div>

                <div className={styles.alertBottom}>
                    <AlertHistoryTable />
                </div>
            </div>
        </Layout>
    );
}
