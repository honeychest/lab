import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { fetchRawWriterDryRunSummaries, fetchRawWriterShadowComparison, fetchRawWriterShadowComparisonWindows } from '@/api/adminTest/rawWriter.js';
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

const EMPTY_WINDOWS = [];
const MINUTE_PRESETS = [5, 15, 60, 180];

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

function describeShadowStatus(status, delta) {
    if (status === 'OK') return 'raw 와 shadow 가 현재 범위에서 일치합니다.';
    if (delta == null) return '차이가 있어 확인이 필요합니다.';
    if (delta > 0) return `shadow 가 raw 보다 ${delta}건 부족합니다.`;
    if (delta < 0) return `shadow 가 raw 보다 ${Math.abs(delta)}건 더 많습니다.`;
    return '건수는 같지만 aggTradeId 범위 차이가 있어 확인이 필요합니다.';
}

function toShadowKey(row) {
    return `${row.symbol ?? '-'}|${row.marketType ?? '-'}`;
}

function formatDelta(value) {
    if (value == null) return '-';
    if (value > 0) return `+${value}`;
    return String(value);
}

function compareDriftLabel(current, previous) {
    if (previous == null) return '첫 비교';
    const drift = current - previous;
    if (drift === 0) return '변화 없음';
    if (drift > 0) return `이전보다 +${drift}`;
    return `이전보다 ${drift}`;
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
    const [windowSummary, setWindowSummary] = useState(EMPTY_WINDOWS);
    const [previousShadow, setPreviousShadow] = useState(null);
    const [lastLog, setLastLog] = useState(null);
    const [shadowLog, setShadowLog] = useState(null);
    const [loading, setLoading] = useState(false);
    const [shadowLoading, setShadowLoading] = useState(false);
    const [compareMinutes, setCompareMinutes] = useState(60);

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

    const handleShadowRefresh = async (minutes = compareMinutes) => {
        if (shadowLoading) return;
        setShadowLoading(true);
        const [detailLog, windowsLog] = await Promise.all([
            logApiCall(
            `GET /api/admin/test/agg-trade/raw-writer/shadow-comparison?minutes=${minutes}`,
            () => fetchRawWriterShadowComparison(minutes)
            ),
            logApiCall(
                `GET /api/admin/test/agg-trade/raw-writer/shadow-comparison/windows?minutes=${MINUTE_PRESETS.join(',')}`,
                () => fetchRawWriterShadowComparisonWindows(MINUTE_PRESETS)
            ),
        ]);
        setShadowLog(detailLog);
        if (detailLog.ok) {
            setPreviousShadow(shadow.rows);
            setShadow({
                minutes: detailLog.responseBody?.minutes ?? minutes,
                rows: Array.isArray(detailLog.responseBody?.rows) ? detailLog.responseBody.rows : [],
            });
        }
        if (windowsLog.ok) {
            setWindowSummary(Array.isArray(windowsLog.responseBody?.windows) ? windowsLog.responseBody.windows : []);
        }
        setShadowLoading(false);
    };

    useEffect(() => {
        handleRefresh();
        handleShadowRefresh(compareMinutes);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const previousRowMap = new Map((previousShadow ?? []).map((row) => [toShadowKey(row), row]));

    return (
        <div className={styles.page}>
            <header className={styles.header}>
                <div>
                    <h1 className={styles.title}>Raw Writer</h1>
                    <p className={styles.subtitle}>현재 mode 기준으로 target table 상태를 보고, 아래 비교 영역에서 raw 와 shadow 차이가 유지되는지 시간창별로 확인합니다.</p>
                </div>
            </header>

            <section className={styles.helpGrid}>
                <div className={styles.helpBox}>
                    <h2 className={styles.helpTitle}>이 화면에서 보는 것</h2>
                    <p className={styles.helpText}>
                        위 영역은 현재 파이프라인 상태를 보여줍니다. 실제 검증은 아래 Shadow Compare 에서 최근 시간창 기준 raw 운영 테이블과 현재 target table 을 비교해 판단합니다.
                    </p>
                </div>
                <div className={styles.helpBox}>
                    <h2 className={styles.helpTitle}>비교 버튼 역할</h2>
                    <p className={styles.helpText}>
                        선택한 시간창 상세 비교와 5/15/60/180분 요약 비교를 같이 다시 호출합니다. 첫 비교 이후 다시 누르면 이전 비교와 현재 비교의 delta 변화도 같이 볼 수 있습니다.
                    </p>
                </div>
                <div className={styles.helpBox}>
                    <h2 className={styles.helpTitle}>시간창 판단</h2>
                    <p className={styles.helpText}>
                        5분은 최근 추세, 15분은 단기 누적, 60분 이상은 drift 누적 여부 확인용입니다. 짧은 창과 긴 창을 같이 보면 일시적 경계 차이인지 누적 차이인지 구분하기 쉽습니다.
                    </p>
                </div>
                <div className={styles.helpBox}>
                    <h2 className={styles.helpTitle}>판단 기준</h2>
                    <p className={styles.helpText}>
                        `OK` 는 raw 와 shadow 가 현재 범위에서 일치합니다. `CHECK` 는 건수 차이 또는 aggTradeId 범위 차이가 있다는 뜻입니다. delta 가 양수면 shadow 부족, 음수면 shadow 과다입니다.
                    </p>
                </div>
            </section>

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
                    <strong>{lastLog ? `${lastLog.statusCode ?? '-'} / ${lastLog.durationMs}ms` : (loading ? '조회 중' : '-')}</strong>
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
                            {shadowLog ? `${shadowLog.statusCode ?? '-'} / ${shadowLog.durationMs}ms / last ${shadow.minutes}m` : `last ${shadow.minutes}m`}
                        </p>
                    </div>
                    <div className={styles.compareControls}>
                        <div className={styles.segmentedGroup}>
                            {MINUTE_PRESETS.map((minutes) => (
                                <button
                                    key={minutes}
                                    type="button"
                                    className={`${styles.segmentButton} ${compareMinutes === minutes ? styles.segmentButtonActive : ''}`}
                                    onClick={() => setCompareMinutes(minutes)}
                                    disabled={shadowLoading}
                                >
                                    {minutes}m
                                </button>
                            ))}
                        </div>
                        <input
                            className={styles.minuteInput}
                            type="number"
                            min="1"
                            max="1440"
                            value={compareMinutes}
                            onChange={(event) => setCompareMinutes(Math.max(1, Math.min(1440, Number(event.target.value) || 1)))}
                        />
                        <button className={styles.refreshButton} onClick={() => handleShadowRefresh(compareMinutes)} disabled={shadowLoading}>
                            <RefreshCw size={16} />
                            {shadowLoading ? '조회 중' : `${compareMinutes}분 비교`}
                        </button>
                    </div>
                </div>

                <div className={styles.compareSummary}>
                    <div className={styles.helpText}>추천 사용법: 5m, 15m, 60m 순서로 비교해서 delta 가 늘어나는지 확인합니다.</div>
                    <div className={styles.helpText}>현재 표는 직전 비교 결과와의 delta 변화도 같이 보여줍니다.</div>
                </div>

                <div className={styles.windowGrid}>
                    {windowSummary.map((entry) => (
                        <div key={entry.minutes} className={styles.windowBox}>
                            <div className={styles.windowTitle}>{entry.minutes}m</div>
                            <div className={styles.windowMetric}>CHECK {entry.checkRows} / {entry.totalRows}</div>
                            <div className={styles.windowMetric}>total delta {formatDelta(entry.totalDelta)}</div>
                        </div>
                    ))}
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
                                    <th>prev delta</th>
                                    <th>drift</th>
                                    <th>aggTradeId raw / shadow</th>
                                    <th>status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {shadow.rows.map((row, index) => {
                                    const previousRow = previousRowMap.get(toShadowKey(row));
                                    return (
                                        <tr
                                            key={`${row.symbol ?? '-'}-${row.marketType ?? '-'}-${index}`}
                                            className={row.status === 'OK' ? styles.matchRow : styles.mismatchRow}
                                        >
                                            <td>{row.symbol ?? '-'} / {row.marketType ?? '-'}</td>
                                            <td>{row.rawCount ?? 0}</td>
                                            <td>{row.shadowCount ?? 0}</td>
                                            <td>{formatDelta(row.countDelta ?? 0)}</td>
                                            <td>{formatDelta(previousRow?.countDelta)}</td>
                                            <td>{compareDriftLabel(row.countDelta ?? 0, previousRow?.countDelta)}</td>
                                            <td>
                                                {formatRange(row.rawMinSequence, row.rawMaxSequence)}
                                                {' / '}
                                                {formatRange(row.shadowMinSequence, row.shadowMaxSequence)}
                                            </td>
                                            <td>
                                                <div>{row.status ?? 'CHECK'}</div>
                                                <div className={styles.cellHint}>{describeShadowStatus(row.status, row.countDelta)}</div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    )}
                </div>
            </section>
        </div>
    );
}
