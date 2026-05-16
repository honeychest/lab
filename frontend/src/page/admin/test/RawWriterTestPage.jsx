import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import {
    fetchRawWriterKafkaObservability,
    fetchRawWriterKafkaObservabilityWindows,
} from '@/api/adminTest/rawWriter.js';
import { logApiCall } from './shared/logApiCall.js';
import styles from './RawWriterTestPage.module.css';

const EMPTY_SNAPSHOT = {
    mode: null,
    enabled: false,
    dryRun: false,
    targetTable: null,
    listenerRunning: false,
    consumerGroupId: null,
    bootstrapServers: null,
    totalConsumedRecords: 0,
    totalWriteSuccessRecords: 0,
    totalInvalidRecords: 0,
    totalDlqPublishedRecords: 0,
    totalDlqPublishFailureRecords: 0,
    totalDbFailureRecords: 0,
    totalSuccessfulBatches: 0,
    totalFailedBatches: 0,
    lastSuccessAtMs: null,
    lastErrorAtMs: null,
    lastErrorMessage: null,
    rawTopic: null,
    dlqTopic: null,
};

const EMPTY_WINDOWS = {
    minutes: 60,
    bucketSeconds: 60,
    windows: [],
};

const MINUTE_PRESETS = [15, 60, 180, 720];

function formatMode(mode) {
    return mode ? String(mode).toUpperCase() : 'UNKNOWN';
}

function formatFlag(value) {
    return value ? 'ON' : 'OFF';
}

function formatCount(value) {
    if (value == null) return '-';
    return new Intl.NumberFormat('ko-KR').format(value);
}

function formatTime(value) {
    if (!value) return '-';
    return new Date(value).toLocaleString('ko-KR', { hour12: false });
}

function formatRange(startMs, endMs) {
    return `${formatTime(startMs)} ~ ${formatTime(endMs)}`;
}

function describeBucket(row) {
    if ((row.failedBatches ?? 0) > 0) {
        return `실패 batch ${row.failedBatches}회, DB 실패 ${row.dbFailureRecords ?? 0}, DLQ 실패 ${row.dlqPublishFailureRecords ?? 0}`;
    }
    if ((row.invalidRecords ?? 0) > 0 || (row.dlqPublishedRecords ?? 0) > 0) {
        return `invalid ${row.invalidRecords ?? 0}, DLQ ${row.dlqPublishedRecords ?? 0}`;
    }
    return '정상 처리 구간';
}

function topicSummary(topic) {
    if (!topic) return '-';
    if (topic.errorMessage) return topic.errorMessage;
    const latest = formatCount(topic.latestOffsetSum);
    const lag = topic.lagSum == null ? '-' : formatCount(topic.lagSum);
    return `partitions ${topic.partitionCount ?? '-'} / latest ${latest} / lag ${lag}`;
}

function statusClass(row) {
    if ((row.failedBatches ?? 0) > 0) return styles.mismatchRow;
    if ((row.invalidRecords ?? 0) > 0 || (row.dlqPublishedRecords ?? 0) > 0) return styles.partialRow;
    return styles.matchRow;
}

export default function RawWriterTestPage() {
    const [snapshot, setSnapshot] = useState(EMPTY_SNAPSHOT);
    const [windows, setWindows] = useState(EMPTY_WINDOWS);
    const [snapshotLog, setSnapshotLog] = useState(null);
    const [windowsLog, setWindowsLog] = useState(null);
    const [loading, setLoading] = useState(false);
    const [selectedMinutes, setSelectedMinutes] = useState(60);

    const loadTelemetry = async (minutes = selectedMinutes) => {
        if (loading) return;
        setLoading(true);
        const [snapshotResult, windowsResult] = await Promise.all([
            logApiCall(
                'GET /api/admin/test/agg-trade/raw-writer/kafka-observability',
                fetchRawWriterKafkaObservability
            ),
            logApiCall(
                `GET /api/admin/test/agg-trade/raw-writer/kafka-observability/windows?minutes=${minutes}&bucketSeconds=60`,
                () => fetchRawWriterKafkaObservabilityWindows(minutes, 60)
            ),
        ]);
        setSnapshotLog(snapshotResult);
        setWindowsLog(windowsResult);
        if (snapshotResult.ok) {
            setSnapshot({
                ...EMPTY_SNAPSHOT,
                ...snapshotResult.responseBody,
            });
        }
        if (windowsResult.ok) {
            setWindows({
                minutes: windowsResult.responseBody?.minutes ?? minutes,
                bucketSeconds: windowsResult.responseBody?.bucketSeconds ?? 60,
                windows: Array.isArray(windowsResult.responseBody?.windows) ? windowsResult.responseBody.windows : [],
            });
        }
        setLoading(false);
    };

    useEffect(() => {
        loadTelemetry(selectedMinutes);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
        <div className={styles.page}>
            <header className={styles.header}>
                <div>
                    <h1 className={styles.title}>Raw Writer Kafka Telemetry</h1>
                    <p className={styles.subtitle}>
                        legacy raw 비교 대신 Kafka topic, consumer lag, DLQ, 시간별 처리량을 직접 봅니다.
                    </p>
                </div>
                <button className={styles.refreshButton} onClick={() => loadTelemetry(selectedMinutes)} disabled={loading}>
                    <RefreshCw size={16} />
                    {loading ? '조회 중' : 'Kafka 재조회'}
                </button>
            </header>

            <section className={styles.helpGrid}>
                <div className={styles.helpBox}>
                    <h2 className={styles.helpTitle}>무엇을 보는가</h2>
                    <p className={styles.helpText}>
                        이 화면은 DB 비교가 아니라 Kafka 신규 경로 자체를 봅니다. raw topic latest offset, consumer committed offset, lag, DLQ 적재량, 최근 시간별 처리량을 같이 봅니다.
                    </p>
                </div>
                <div className={styles.helpBox}>
                    <h2 className={styles.helpTitle}>핵심 판단</h2>
                    <p className={styles.helpText}>
                        lag 가 계속 누적되지 않고 회복되는지, invalid/DLQ 가 특정 시간대에 몰리는지, DB 실패 batch 가 생기는지 확인합니다.
                    </p>
                </div>
                <div className={styles.helpBox}>
                    <h2 className={styles.helpTitle}>DLQ 해석</h2>
                    <p className={styles.helpText}>
                        DLQ published 는 잘못된 메시지를 격리한 건수입니다. DLQ publish failure 가 생기면 offset commit 이 보류될 수 있으므로 바로 확인해야 합니다.
                    </p>
                </div>
                <div className={styles.helpBox}>
                    <h2 className={styles.helpTitle}>시간별 표 해석</h2>
                    <p className={styles.helpText}>
                        consumed 와 write success 가 비슷하고 failed batch 가 0 이면 정상입니다. invalid, DLQ, DB failure 가 보이면 그 시간대 로그와 같이 봅니다.
                    </p>
                </div>
            </section>

            <section className={styles.statusGrid}>
                <div className={styles.statusBox}>
                    <span className={styles.statusLabel}>mode</span>
                    <strong>{formatMode(snapshot.mode)}</strong>
                </div>
                <div className={styles.statusBox}>
                    <span className={styles.statusLabel}>listener</span>
                    <strong>{formatFlag(snapshot.listenerRunning)}</strong>
                </div>
                <div className={styles.statusBox}>
                    <span className={styles.statusLabel}>target</span>
                    <strong>{snapshot.targetTable ?? '-'}</strong>
                </div>
                <div className={styles.statusBox}>
                    <span className={styles.statusLabel}>group</span>
                    <strong>{snapshot.consumerGroupId ?? '-'}</strong>
                </div>
                <div className={styles.statusBox}>
                    <span className={styles.statusLabel}>raw lag</span>
                    <strong>{formatCount(snapshot.rawTopic?.lagSum)}</strong>
                </div>
                <div className={styles.statusBox}>
                    <span className={styles.statusLabel}>dlq total</span>
                    <strong>{formatCount(snapshot.dlqTopic?.latestOffsetSum)}</strong>
                </div>
            </section>

            <section className={styles.summaryGrid}>
                <div className={styles.metricBox}>
                    <span className={styles.statusLabel}>consumed</span>
                    <strong>{formatCount(snapshot.totalConsumedRecords)}</strong>
                </div>
                <div className={styles.metricBox}>
                    <span className={styles.statusLabel}>write success</span>
                    <strong>{formatCount(snapshot.totalWriteSuccessRecords)}</strong>
                </div>
                <div className={styles.metricBox}>
                    <span className={styles.statusLabel}>invalid</span>
                    <strong>{formatCount(snapshot.totalInvalidRecords)}</strong>
                </div>
                <div className={styles.metricBox}>
                    <span className={styles.statusLabel}>dlq published</span>
                    <strong>{formatCount(snapshot.totalDlqPublishedRecords)}</strong>
                </div>
                <div className={styles.metricBox}>
                    <span className={styles.statusLabel}>db failure</span>
                    <strong>{formatCount(snapshot.totalDbFailureRecords)}</strong>
                </div>
                <div className={styles.metricBox}>
                    <span className={styles.statusLabel}>failed batch</span>
                    <strong>{formatCount(snapshot.totalFailedBatches)}</strong>
                </div>
            </section>

            <section className={styles.topicGrid}>
                <div className={styles.topicBox}>
                    <h2 className={styles.panelTitle}>Raw Topic</h2>
                    <p className={styles.panelMeta}>{topicSummary(snapshot.rawTopic)}</p>
                    <p className={styles.helpText}>bootstrap {snapshot.bootstrapServers ?? '-'}</p>
                </div>
                <div className={styles.topicBox}>
                    <h2 className={styles.panelTitle}>DLQ Topic</h2>
                    <p className={styles.panelMeta}>{topicSummary(snapshot.dlqTopic)}</p>
                    <p className={styles.helpText}>
                        last success {formatTime(snapshot.lastSuccessAtMs)} / last error {formatTime(snapshot.lastErrorAtMs)}
                    </p>
                    {snapshot.lastErrorMessage && (
                        <p className={styles.errorText}>{snapshot.lastErrorMessage}</p>
                    )}
                </div>
            </section>

            <section className={styles.telemetryPanel}>
                <div className={styles.panelHeader}>
                    <div>
                        <h2 className={styles.panelTitle}>시간별 Kafka 처리량</h2>
                        <p className={styles.panelMeta}>
                            {windowsLog ? `${windowsLog.statusCode ?? '-'} / ${windowsLog.durationMs}ms / ${windows.minutes}m / ${windows.bucketSeconds}s bucket` : `${windows.minutes}m / ${windows.bucketSeconds}s bucket`}
                        </p>
                    </div>
                    <div className={styles.compareControls}>
                        <div className={styles.segmentedGroup}>
                            {MINUTE_PRESETS.map((minutes) => (
                                <button
                                    key={minutes}
                                    type="button"
                                    className={`${styles.segmentButton} ${selectedMinutes === minutes ? styles.segmentButtonActive : ''}`}
                                    onClick={() => setSelectedMinutes(minutes)}
                                    disabled={loading}
                                >
                                    {minutes}m
                                </button>
                            ))}
                        </div>
                        <button className={styles.refreshButton} onClick={() => loadTelemetry(selectedMinutes)} disabled={loading}>
                            <RefreshCw size={16} />
                            {loading ? '조회 중' : `${selectedMinutes}분 상세`}
                        </button>
                    </div>
                </div>

                <div className={styles.summaryTableWrap}>
                    {windows.windows.length === 0 ? (
                        <div className={styles.emptyBox}>Kafka 시간별 데이터가 아직 없습니다.</div>
                    ) : (
                        <table className={styles.summaryTable}>
                            <thead>
                                <tr>
                                    <th>time bucket</th>
                                    <th>consumed</th>
                                    <th>write success</th>
                                    <th>invalid</th>
                                    <th>dlq published</th>
                                    <th>dlq publish fail</th>
                                    <th>db failure</th>
                                    <th>success batch</th>
                                    <th>failed batch</th>
                                    <th>status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {windows.windows.map((row) => (
                                    <tr key={row.bucketStartMs} className={statusClass(row)}>
                                        <td>{formatRange(row.bucketStartMs, row.bucketEndMs)}</td>
                                        <td>{formatCount(row.consumedRecords)}</td>
                                        <td>{formatCount(row.writeSuccessRecords)}</td>
                                        <td>{formatCount(row.invalidRecords)}</td>
                                        <td>{formatCount(row.dlqPublishedRecords)}</td>
                                        <td>{formatCount(row.dlqPublishFailureRecords)}</td>
                                        <td>{formatCount(row.dbFailureRecords)}</td>
                                        <td>{formatCount(row.successfulBatches)}</td>
                                        <td>{formatCount(row.failedBatches)}</td>
                                        <td>
                                            <div>{describeBucket(row)}</div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            </section>

            <section className={styles.partitionGrid}>
                <div className={styles.partitionPanel}>
                    <h2 className={styles.panelTitle}>Raw Topic Partitions</h2>
                    <div className={styles.summaryTableWrap}>
                        <table className={styles.summaryTable}>
                            <thead>
                                <tr>
                                    <th>partition</th>
                                    <th>latest</th>
                                    <th>committed</th>
                                    <th>lag</th>
                                </tr>
                            </thead>
                            <tbody>
                                {(snapshot.rawTopic?.partitions ?? []).map((row) => (
                                    <tr key={`raw-${row.partition}`}>
                                        <td>{row.partition}</td>
                                        <td>{formatCount(row.latestOffset)}</td>
                                        <td>{formatCount(row.committedOffset)}</td>
                                        <td>{formatCount(row.lag)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                <div className={styles.partitionPanel}>
                    <h2 className={styles.panelTitle}>DLQ Topic Partitions</h2>
                    <div className={styles.summaryTableWrap}>
                        <table className={styles.summaryTable}>
                            <thead>
                                <tr>
                                    <th>partition</th>
                                    <th>latest</th>
                                    <th>committed</th>
                                    <th>lag</th>
                                </tr>
                            </thead>
                            <tbody>
                                {(snapshot.dlqTopic?.partitions ?? []).map((row) => (
                                    <tr key={`dlq-${row.partition}`}>
                                        <td>{row.partition}</td>
                                        <td>{formatCount(row.latestOffset)}</td>
                                        <td>{formatCount(row.committedOffset)}</td>
                                        <td>{formatCount(row.lag)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </section>
        </div>
    );
}
