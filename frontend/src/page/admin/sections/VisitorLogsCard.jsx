import styles from '../AdminPage.module.css';

export default function VisitorLogsCard({ visitor }) {
    const { visitorData, visitorLoading, visitorError, loadVisitorLogs } = visitor;
    return (
        <div className={styles.card}>
            <div className={styles.titleRow}>
                <div className={styles.title}>방문 현황</div>
                <button
                    type="button"
                    className={`${styles.btn} ${styles.btnActive} ${styles.pushRight}`}
                    onClick={loadVisitorLogs}
                    disabled={visitorLoading}
                >
                    {visitorLoading ? '로딩 중...' : '새로고침'}
                </button>
            </div>
            {visitorError && (
                <div className={`${styles.muted} ${styles.error}`}>{visitorError}</div>
            )}
            {visitorData && (
                <div className={styles.visitorGrid}>
                    <div>
                        <div className={`${styles.label} ${styles.labelSpacer}`}>경로별 집계</div>
                        <div className={styles.tableWrapScroll}>
                            <table className={styles.table}>
                                <thead>
                                    <tr>
                                        <th className={styles.th}>경로</th>
                                        <th className={styles.th}>횟수</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {visitorData.topPaths.map((p, i) => (
                                        <tr key={p.path} className={i % 2 === 1 ? styles.trOdd : ''}>
                                            <td className={`${styles.td} ${styles.mono}`}>{p.path}</td>
                                            <td className={`${styles.td} ${styles.mono}`}>{p.cnt.toLocaleString()}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                    <div>
                        <div className={`${styles.label} ${styles.labelSpacer}`}>최근 방문 이력</div>
                        <div className={styles.tableWrapScroll}>
                            <table className={styles.table}>
                                <thead>
                                    <tr>
                                        <th className={styles.th}>일시</th>
                                        <th className={styles.th}>IP</th>
                                        <th className={styles.th}>경로</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {visitorData.recent.map((v, i) => (
                                        <tr key={i} className={i % 2 === 1 ? styles.trOdd : ''}>
                                            <td className={`${styles.td} ${styles.mono}`}>{v.visitedAt.replace('T', ' ').substring(0, 19)}</td>
                                            <td className={`${styles.td} ${styles.mono}`}>{v.ip}</td>
                                            <td className={`${styles.td} ${styles.mono}`}>{v.path}</td>
                                        </tr>
                                    ))}
                                    {visitorData.recent.length === 0 && (
                                        <tr><td colSpan={3} className={`${styles.muted} ${styles.tableEmpty}`}>데이터 없음</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
