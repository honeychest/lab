import { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { fetchRawWriterDryRunSummaries, fetchRawWriterShadowComparison } from '@/api/adminTest/rawWriter.js';
import { logApiCall } from './shared/logApiCall.js';
import styles from './RawWriterTestPage.module.css';

const EMPTY_SUMMARY = {
    mode: null,
    enabled: null,
    dryRun: null,
    targetTable: null,
    summaries: [],
};

const EMPTY_SHADOW = {
    minutes: 60,
    rows: [],
};

function asList(body) {
    if (Array.isArray(body)) return body;
    if (Array.isArray(body?.summaries)) return body.summaries;
    if (Array.isArray(body?.items)) return body.items;
    return [];
}

function formatStatus(value) {
    if (value === true) return 'ON';
    if (value === false) return 'OFF';
    return 'UNKNOWN';
}

function formatMode(mode) {
    if (!mode) return 'UNKNOWN';
    return String(mode).toUpperCase();
}

function getSummaryEmptyMessage(mode) {
    if (mode === 'off') return 'raw-writer mode가 OFF 입니다. Kafka consume 이 비활성입니다.';
    if (mode === 'debug') return '현재 mode=DEBUG 입니다. _test 테이블 적재 여부는 아래 Shadow Compare 를 확인하세요.';
    if (mode === 'live') return '현재 mode=LIVE 입니다. dry-run summary를 쌓지 않습니다.';
    return 'dry-run summary가 없습니다.';
}

function formatTime(value) {
    if (value == null) return '-';
    if (typeof value === 'number') return new Date(value).toLocaleString();
    return String(value);
}

function formatRange(min, max) {
    if (min == null && max == null) return '-';
    if (min === max) return String(min ?? max ?? '-');
    return `${min ?? '-'} ~ ${max ?? '-'}`;
}

function formatTimeRange(min, max) {
    if (min == null && max == null) return '-';
    if (min === max) return formatTime(min);
    return `${formatTime(min)} ~ ${formatTime(max)}`;
}

export default function RawWriterTestPage() {
    const [state, setState] = useState(EMPTY_SUMMARY);
    const [shadow, setShadow] = useState(EMPTY_SHADOW);
    const [lastLog, setLastLog] = useState(null);
    const [shadowLog, setShadowLog] = useState(null);
    const [loading, setLoading] = useState(false);
    const [shadowLoading, setShadowLoading] = useState(false);

    const handleRefresh = async () => {
        if (loading) return;
        setLoading(true);
        const log = await logApiCall(
            'GET /api/admin/test/agg-trade/raw-writer/dry-run-summaries',
            fetchRawWriterDryRunSummaries
        );
        setLastLog(log);
        if (log.ok) {
            setState({
                mode: log.responseBody?.mode ?? null,
                enabled: log.responseBody?.enabled ?? null,
                dryRun: log.responseBody?.dryRun ?? null,
                targetTable: log.responseBody?.targetTable ?? null,
                summaries: asList(log.responseBody),
            });
        }
        setLoading(false);
    };

    const handleShadowRefresh = async () => {
        if (shadowLoading) return;
        setShadowLoading(true);
        const log = await logApiCall(
            'GET /api/admin/test/agg-trade/raw-writer/shadow-comparison?minutes=60',
            () => fetchRawWriterShadowComparison(60)
        );
        setShadowLog(log);
        if (log.ok) {
            setShadow({
                minutes: log.responseBody?.minutes ?? 60,
                rows: Array.isArray(log.responseBody?.rows) ? log.responseBody.rows : [],
            });
        }
        setShadowLoading(false);
    };

    return (
        <div className={styles.page}>
            <header className={styles.header}>
                <div>
                    <h1 className={styles.title}>Raw Writer</h1>
                    <p className={styles.subtitle}>현재 mode 기준으로 Kafka consume 상태와 dry-run 또는 shadow 검증 결과를 확인합니다.</p>
                </div>
                <button className={styles.refreshButton} onClick={handleRefresh} disabled={loading}>
                    <RefreshCw size={16} />
                    {loading ? '조회 중' : '새로고침'}
                </button>
            </header>

            <section className={styles.statusGrid}>
                <div className={styles.statusBox}>
                    <span className={styles.statusLabel}>mode</span>
                    <strong>{formatMode(state.mode)}</strong>
                </div>
                <div className={styles.statusBox}>
                    <span className={styles.statusLabel}>consume</span>
                    <strong>{formatStatus(state.enabled)}</strong>
                </div>
                <div className={styles.statusBox}>
                    <span className={styles.statusLabel}>target</span>
                    <strong>{state.targetTable ?? '-'}</strong>
                </div>
                <div className={styles.statusBox}>
                    <span className={styles.statusLabel}>last request</span>
                    <strong>{lastLog ? `${lastLog.statusCode ?? '-'} / ${lastLog.durationMs}ms` : '-'}</strong>
                </div>
            </section>

            {lastLog && !lastLog.ok && (
                <div className={styles.errorBox}>
                    {lastLog.errorMessage}
                </div>
            )}

            <section className={styles.summaryTableWrap}>
                {state.summaries.length === 0 ? (
                    <div className={styles.emptyBox}>{getSummaryEmptyMessage(state.mode)}</div>
                ) : (
                    <table className={styles.summaryTable}>
                        <thead>
                            <tr>
                                <th>topic</th>
                                <th>window</th>
                                <th>symbol / market</th>
                                <th>Kafka count</th>
                                <th>DB count</th>
                                <th>aggTradeId K / DB</th>
                                <th>tradedAt K / DB</th>
                                <th>invalid</th>
                                <th>match</th>
                            </tr>
                        </thead>
                        <tbody>
                            {state.summaries.map((summary, index) => {
                                return (
                                    <tr
                                        key={summary.id ?? `window-${index}`}
                                        className={
                                            summary.comparisonStatus === 'PARTIAL'
                                                ? styles.partialRow
                                                : summary.comparisonStatus === 'OK'
                                                    ? styles.matchRow
                                                    : styles.mismatchRow
                                        }
                                    >
                                        <td>10s compare</td>
                                        <td>{formatTimeRange(summary.windowStartMs, summary.windowEndMs)}</td>
                                        <td>{summary.symbol ?? '-'} / {summary.marketType ?? '-'}</td>
                                        <td>{summary.kafkaCount ?? 0}</td>
                                        <td>{summary.dbCount ?? 0}</td>
                                        <td>
                                            {formatRange(summary.kafkaMinAggTradeId, summary.kafkaMaxAggTradeId)}
                                            {' / '}
                                            {formatRange(summary.dbMinAggTradeId, summary.dbMaxAggTradeId)}
                                        </td>
                                        <td>
                                            {formatTimeRange(summary.kafkaMinTradedAt, summary.kafkaMaxTradedAt)}
                                            {' / '}
                                            {formatTimeRange(summary.dbMinTradedAt, summary.dbMaxTradedAt)}
                                        </td>
                                        <td>{summary.invalidCount ?? 0}</td>
                                        <td>{summary.comparisonStatus ?? (summary.countMatched && summary.rangeMatched ? 'OK' : 'CHECK')}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                )}
            </section>

            <section className={styles.shadowPanel}>
                <div className={styles.panelHeader}>
                    <div>
                        <h2 className={styles.panelTitle}>Shadow Compare</h2>
                        <p className={styles.panelMeta}>
                            {shadowLog ? `${shadowLog.statusCode ?? '-'} / ${shadowLog.durationMs}ms` : `last ${shadow.minutes}m`}
                        </p>
                    </div>
                    <button className={styles.refreshButton} onClick={handleShadowRefresh} disabled={shadowLoading}>
                        <RefreshCw size={16} />
                        {shadowLoading ? '조회 중' : '비교'}
                    </button>
                </div>

                {shadowLog && !shadowLog.ok && (
                    <div className={styles.errorBox}>
                        {shadowLog.errorMessage}
                    </div>
                )}

                <div className={styles.summaryTableWrap}>
                    {shadow.rows.length === 0 ? (
                        <div className={styles.emptyBox}>shadow 비교 결과가 없습니다.</div>
                    ) : (
                        <table className={`${styles.summaryTable} ${styles.shadowTable}`}>
                            <thead>
                                <tr>
                                    <th>symbol / market</th>
                                    <th>raw count</th>
                                    <th>shadow count</th>
                                    <th>delta</th>
                                    <th>aggTradeId raw / shadow</th>
                                    <th>status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {shadow.rows.map((row, index) => (
                                    <tr
                                        key={`${row.symbol ?? '-'}-${row.marketType ?? '-'}-${index}`}
                                        className={row.status === 'OK' ? styles.matchRow : styles.mismatchRow}
                                    >
                                        <td>{row.symbol ?? '-'} / {row.marketType ?? '-'}</td>
                                        <td>{row.rawCount ?? 0}</td>
                                        <td>{row.shadowCount ?? 0}</td>
                                        <td>{row.countDelta ?? 0}</td>
                                        <td>
                                            {formatRange(row.rawMinSequence, row.rawMaxSequence)}
                                            {' / '}
                                            {formatRange(row.shadowMinSequence, row.shadowMaxSequence)}
                                        </td>
                                        <td>{row.status ?? 'CHECK'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            </section>
        </div>
    );
}
