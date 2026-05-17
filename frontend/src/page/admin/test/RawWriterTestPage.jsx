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
    summary: null,
    recentFailures: [],
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

function describeFailure(sample) {
    const where = `${sample.symbol ?? 'UNKNOWN'} / ${sample.marketType ?? 'UNKNOWN'} / p${sample.partition ?? '-'} / o${sample.offset ?? '-'}`;
    return `${sample.failureType} - ${where}`;
}

function statusClass(row) {
    if ((row.failedBatches ?? 0) > 0) return styles.mismatchRow;
    if ((row.invalidRecords ?? 0) > 0 || (row.dlqPublishedRecords ?? 0) > 0) return styles.partialRow;
    return styles.matchRow;
}

export default function RawWriterTestPage() {
    const [snapshot, setSnapshot] = useState(EMPTY_SNAPSHOT);
    const [windows, setWindows] = useState(EMPTY_WINDOWS);
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
                    <h1 className={styles.title}>Raw Writer Kafka Telemetry(Kafka 적재기 텔레메트리 - 소비/적재/실패 현황)</h1>
                    <p className={styles.subtitle}>
                        legacy raw 비교 대신 Kafka topic, consumer lag, DLQ, 시간별 처리량을 직접 봅니다.
                    </p>
                </div>
                <button className={styles.refreshButton} onClick={() => loadTelemetry(selectedMinutes)} disabled={loading}>
                    <RefreshCw size={16} />
                    {loading ? '조회 중' : 'Kafka 재조회'}
                </button>
            </header>

            <section className={styles.statusGrid}>
                <div className={styles.statusBox}>
                    <span className={styles.statusLabel}>mode(파이프라인 실행 모드 OFF/DRY_RUN/DEBUG/LIVE)</span>
                    <strong>{formatMode(snapshot.mode)}</strong>
                </div>
                <div className={styles.statusBox}>
                    <span className={styles.statusLabel}>listener(Kafka consumer 컨테이너 가동 여부)</span>
                    <strong>{formatFlag(snapshot.listenerRunning)}</strong>
                </div>
                <div className={styles.statusBox}>
                    <span className={styles.statusLabel}>target(insert 대상 테이블명)</span>
                    <strong>{snapshot.targetTable ?? '-'}</strong>
                </div>
                <div className={styles.statusBox}>
                    <span className={styles.statusLabel}>group(Kafka consumer group id)</span>
                    <strong>{snapshot.consumerGroupId ?? '-'}</strong>
                </div>
                <div className={styles.statusBox}>
                    <span className={styles.statusLabel}>raw lag(raw 토픽에서 아직 안 읽은 메시지 수)</span>
                    <strong>{formatCount(snapshot.rawTopic?.lagSum)}</strong>
                </div>
                <div className={styles.statusBox}>
                    <span className={styles.statusLabel}>dlq total(DLQ 토픽 누적 발행 수)</span>
                    <strong>{formatCount(snapshot.dlqTopic?.latestOffsetSum)}</strong>
                </div>
            </section>

            <section className={styles.summaryGrid}>
                <div className={styles.metricBox}>
                    <span className={styles.statusLabel}>consumed(raw 토픽에서 읽어서 처리 시도한 총 수)</span>
                    <strong>{formatCount(snapshot.totalConsumedRecords)}</strong>
                </div>
                <div className={styles.metricBox}>
                    <span className={styles.statusLabel}>write success(DB insert까지 성공한 수)</span>
                    <strong>{formatCount(snapshot.totalWriteSuccessRecords)}</strong>
                </div>
                <div className={styles.metricBox}>
                    <span className={styles.statusLabel}>invalid(parse 실패한 잘못된 메시지 수)</span>
                    <strong>{formatCount(snapshot.totalInvalidRecords)}</strong>
                </div>
                <div className={styles.metricBox}>
                    <span className={styles.statusLabel}>dlq published(invalid 메시지를 DLQ로 보낸 수)</span>
                    <strong>{formatCount(snapshot.totalDlqPublishedRecords)}</strong>
                </div>
                <div className={styles.metricBox}>
                    <span className={styles.statusLabel}>db failure(DB 예외 발생해서 offset commit 보류된 레코드 수, 다음 polling에서 재시도)</span>
                    <strong>{formatCount(snapshot.totalDbFailureRecords)}</strong>
                </div>
                <div className={styles.metricBox}>
                    <span className={styles.statusLabel}>failed batch(배치 단위 실패 횟수)</span>
                    <strong>{formatCount(snapshot.totalFailedBatches)}</strong>
                </div>
            </section>

            <section className={styles.summaryGrid}>
                <div className={styles.metricBox}>
                    <span className={styles.statusLabel}>peak consumed(1분 bucket 중 최대 소비량)</span>
                    <strong>{formatCount(snapshot.summary?.peakConsumedRecords)}</strong>
                </div>
                <div className={styles.metricBox}>
                    <span className={styles.statusLabel}>peak invalid(1분 bucket 중 최대 invalid 발생량)</span>
                    <strong>{formatCount(snapshot.summary?.peakInvalidRecords)}</strong>
                </div>
                <div className={styles.metricBox}>
                    <span className={styles.statusLabel}>peak dlq(1분 bucket 중 최대 DLQ 발행량)</span>
                    <strong>{formatCount(snapshot.summary?.peakDlqPublishedRecords)}</strong>
                </div>
                <div className={styles.metricBox}>
                    <span className={styles.statusLabel}>peak db fail(1분 bucket 중 최대 DB 실패량)</span>
                    <strong>{formatCount(snapshot.summary?.peakDbFailureRecords)}</strong>
                </div>
                <div className={styles.metricBox}>
                    <span className={styles.statusLabel}>peak failed batch(1분 bucket 중 최대 배치 실패 횟수)</span>
                    <strong>{formatCount(snapshot.summary?.peakFailedBatches)}</strong>
                </div>
                <div className={styles.metricBox}>
                    <span className={styles.statusLabel}>worst bucket(failed batch·DB 실패 점수 가장 높은 구간)</span>
                    <strong>{snapshot.summary?.worstWindow ? formatRange(snapshot.summary.worstWindow.bucketStartMs, snapshot.summary.worstWindow.bucketEndMs) : '-'}</strong>
                </div>
            </section>

            <section className={styles.topicGrid}>
                <div className={styles.topicBox}>
                    <h2 className={styles.panelTitle}>Raw Topic(수집기가 발행하는 원본 aggTrade 토픽)</h2>
                    <p className={styles.panelMeta}>{topicSummary(snapshot.rawTopic)}</p>
                    <p className={styles.helpText}>bootstrap(Kafka 브로커 접속 주소) {snapshot.bootstrapServers ?? '-'}</p>
                </div>
                <div className={styles.topicBox}>
                    <h2 className={styles.panelTitle}>DLQ Topic(Dead Letter Queue - 처리 실패 메시지 격리 토픽)</h2>
                    <p className={styles.panelMeta}>{topicSummary(snapshot.dlqTopic)}</p>
                    <p className={styles.helpText}>
                        last success(마지막 batch 성공 시각) {formatTime(snapshot.lastSuccessAtMs)} / last error(마지막 실패 시각) {formatTime(snapshot.lastErrorAtMs)}
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
                                    <th>time bucket(1분 단위 구간)</th>
                                    <th>consumed(해당 구간 소비량)</th>
                                    <th>write success(해당 구간 DB 성공 수)</th>
                                    <th>invalid(해당 구간 잘못된 메시지)</th>
                                    <th>dlq published(해당 구간 DLQ 발행)</th>
                                    <th>dlq publish fail(DLQ 발행 자체 실패)</th>
                                    <th>db failure(해당 구간 DB 실패)</th>
                                    <th>success batch(성공한 배치 수)</th>
                                    <th>failed batch(실패한 배치 수)</th>
                                    <th>status(해당 구간 상태 요약)</th>
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
                    <h2 className={styles.panelTitle}>Worst Bucket(가장 문제 많았던 1분 구간 상세)</h2>
                    {snapshot.summary?.worstWindow ? (
                        <div className={styles.helpBox}>
                            <p className={styles.helpText}>{formatRange(snapshot.summary.worstWindow.bucketStartMs, snapshot.summary.worstWindow.bucketEndMs)}</p>
                            <p className={styles.helpText}>consumed {formatCount(snapshot.summary.worstWindow.consumedRecords)} / success {formatCount(snapshot.summary.worstWindow.writeSuccessRecords)}</p>
                            <p className={styles.helpText}>invalid {formatCount(snapshot.summary.worstWindow.invalidRecords)} / dlq {formatCount(snapshot.summary.worstWindow.dlqPublishedRecords)}</p>
                            <p className={styles.helpText}>db fail {formatCount(snapshot.summary.worstWindow.dbFailureRecords)} / failed batch {formatCount(snapshot.summary.worstWindow.failedBatches)}</p>
                        </div>
                    ) : (
                        <div className={styles.emptyBox}>아직 이상 구간이 없습니다.</div>
                    )}
                </div>

                <div className={styles.partitionPanel}>
                    <h2 className={styles.panelTitle}>Recent Failures(최근 실패 샘플 목록)</h2>
                    <div className={styles.summaryTableWrap}>
                        {snapshot.recentFailures?.length ? (
                            <table className={styles.summaryTable}>
                                <thead>
                                    <tr>
                                        <th>time(발생 시각)</th>
                                        <th>type / location(실패 종류 - symbol/market/partition/offset)</th>
                                        <th>error(에러 메시지)</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {snapshot.recentFailures.map((sample, index) => (
                                        <tr key={`${sample.occurredAtMs}-${index}`} className={styles.mismatchRow}>
                                            <td>{formatTime(sample.occurredAtMs)}</td>
                                            <td>{describeFailure(sample)}</td>
                                            <td>{sample.errorMessage ?? '-'}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        ) : (
                            <div className={styles.emptyBox}>최근 실패 샘플이 없습니다.</div>
                        )}
                    </div>
                </div>
            </section>

            <section className={styles.partitionGrid}>
                <div className={styles.partitionPanel}>
                    <h2 className={styles.panelTitle}>Raw Topic Partitions(raw 토픽 파티션별 offset 상세)</h2>
                    <div className={styles.summaryTableWrap}>
                        <table className={styles.summaryTable}>
                            <thead>
                                <tr>
                                    <th>partition(파티션 번호)</th>
                                    <th>latest(토픽 최신 offset)</th>
                                    <th>committed(consumer가 commit한 offset)</th>
                                    <th>lag(latest - committed, 미처리 수)</th>
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
                    <h2 className={styles.panelTitle}>DLQ Topic Partitions(DLQ 토픽 파티션별 offset 상세)</h2>
                    <div className={styles.summaryTableWrap}>
                        <table className={styles.summaryTable}>
                            <thead>
                                <tr>
                                    <th>partition(파티션 번호)</th>
                                    <th>latest(토픽 최신 offset)</th>
                                    <th>committed(consumer가 commit한 offset)</th>
                                    <th>lag(latest - committed, 미처리 수)</th>
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
