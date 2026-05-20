import NewsFeed from '../../../components/monitor/NewsFeed.jsx';
import styles from '../MonitorPage.module.css';

export default function WsSidebar({ snapshot, maxHeight }) {
    return (
        <aside className={styles.sidebar} style={maxHeight ? { maxHeight } : undefined}>
            <div className={styles.sideCard}>
                <div className={styles.kv}>
                    <span>WS 연결</span>
                    <span className={styles.mono}>{snapshot?.wsConnections ?? '--'}</span>
                </div>
                <div className={styles.wsBreakdown}>
                    Monitor {snapshot?.wsMonitorConnections ?? 0} · Binance {snapshot?.wsBinanceConnections ?? 0} · Upbit {snapshot?.wsUpbitConnections ?? 0} · Candle {snapshot?.wsCandleConnections ?? 0}
                </div>
            </div>
            <NewsFeed />
        </aside>
    );
}
