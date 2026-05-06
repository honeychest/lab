import chs from '@/global/chs';
import styles from '../AdminPage.module.css';
import { HEALTH_HOURS_OPTIONS, OUTLIER_RANGE_OPTIONS, SYMBOLS, MARKETS } from '../constants';
import { fmtNum, fmtDateTime } from '../utils';

export default function DataQualityCard({ dataHealth, outlier }) {
    const {
        healthSymbol, setHealthSymbol, healthMarket, setHealthMarket,
        healthHours, setHealthHours,
        healthData, healthLoading, healthError,
        correctionHealth, correctionResult, correctionLoading, correctionError,
        deletingFlat, deleteMessage,
        handleHealthCheck, handleDeleteFlat,
        handleFlatCorrectionHealth, handleFlatCorrection,
    } = dataHealth;
    const {
        outlierSymbol, setOutlierSymbol, outlierMarket, setOutlierMarket,
        outlierHealth, outlierResult, outlierLoading, outlierError,
        outlierRangeKey, setOutlierRangeKey,
        outlierCustomFrom, setOutlierCustomFrom,
        outlierCustomTo, setOutlierCustomTo,
        handleOutlierCorrectionHealth, handleOutlierCorrection,
        resetOutlierResults,
    } = outlier;

    return (
        <div className={styles.card}>
            <div className={styles.titleRow}>
                <div className={styles.title}>데이터 품질</div>
                <div className={styles.subtitle}>raw 대비 1s 불일치 현황</div>
            </div>
            <div className={styles.inlineRow}>
                <select className={styles.select} value={healthSymbol} onChange={e => setHealthSymbol(e.target.value)}>
                    {SYMBOLS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <select className={styles.select} value={healthMarket} onChange={e => setHealthMarket(e.target.value)}>
                    {MARKETS.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
                <select className={styles.select} value={healthHours} onChange={e => setHealthHours(Number(e.target.value))}>
                    {HEALTH_HOURS_OPTIONS.map(h => <option key={h} value={h}>{h}시간</option>)}
                </select>
                <button
                    type="button"
                    className={`${styles.btn} ${styles.btnActive}`}
                    onClick={handleHealthCheck}
                    disabled={healthLoading}
                >
                    {healthLoading ? '조회 중...' : '조회'}
                </button>
            </div>
            {healthError && <div className={styles.desc} style={{ color: 'var(--monitor-severity-critical)' }}>{healthError}</div>}
            {deleteMessage && <div className={styles.desc} style={{ color: 'var(--monitor-text-secondary)' }}>{deleteMessage}</div>}
            {healthData && (() => {
                const d = healthData.mismatch1s ?? {};
                const cnt = Number(d.flat_count ?? 0);
                const hasFlat = cnt > 0;
                return (
                    <div className={styles.tableWrap}>
                        <table className={styles.table}>
                            <thead>
                                <tr>
                                    {['불일치 건수', '시작', '종료', ''].map(h => <th key={h} className={styles.th}>{h}</th>)}
                                </tr>
                            </thead>
                            <tbody>
                                <tr>
                                    <td className={`${styles.td} ${styles.mono}`} style={{ color: hasFlat ? 'var(--monitor-severity-critical)' : 'var(--monitor-gauge-ok)' }}>
                                        {hasFlat ? fmtNum(cnt) : '✓ 없음'}
                                    </td>
                                    <td className={`${styles.td} ${styles.mono}`}>{hasFlat ? (d.flat_from ?? '—') : '—'}</td>
                                    <td className={`${styles.td} ${styles.mono}`}>{hasFlat ? (d.flat_to   ?? '—') : '—'}</td>
                                    <td className={styles.td}>
                                        {hasFlat && (
                                            <button
                                                type="button"
                                                className={styles.btn}
                                                style={{ color: 'var(--monitor-severity-critical)', padding: '2px 8px', fontSize: '11px' }}
                                                onClick={() => handleDeleteFlat('1s')}
                                                disabled={deletingFlat !== null}
                                            >
                                                {deletingFlat === '1s' ? '삭제 중...' : '초기화'}
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                );
            })()}
            <div className={styles.actions}>
                <button
                    type="button"
                    className={styles.btn}
                    onClick={handleFlatCorrectionHealth}
                    disabled={correctionLoading}
                >
                    {correctionLoading ? '처리 중...' : '보정 진단'}
                </button>
                <button
                    type="button"
                    className={`${styles.btn} ${styles.btnActive}`}
                    onClick={handleFlatCorrection}
                    disabled={correctionLoading || healthMarket !== 'FUTURES'}
                    style={{ opacity: correctionLoading || healthMarket !== 'FUTURES' ? 0.6 : 1 }}
                >
                    {correctionLoading ? '처리 중...' : 'FUTURES 보정 실행'}
                </button>
            </div>
            {correctionError && <div className={styles.desc} style={{ color: 'var(--monitor-severity-critical)' }}>{correctionError}</div>}
            {correctionHealth && (() => {
                const raw = correctionHealth.rawAggTrade ?? {};
                const flat1s = correctionHealth.flat1s ?? {};
                const flat1m = correctionHealth.flat1m ?? {};
                const flat5m = correctionHealth.flat5m ?? {};
                chs.dlog(4, 'flat 대상 row 목록 표시');
                const rows2 = [
                    ['raw', raw.row_count, raw.min_ms, raw.max_ms],
                    ['1s flat', flat1s.flat_count, flat1s.min_ms, flat1s.max_ms],
                    ['1m flat', flat1m.flat_count, flat1m.min_ms, flat1m.max_ms],
                    ['5m flat', flat5m.flat_count, flat5m.min_ms, flat5m.max_ms],
                ];
                const flatRows = [
                    ['1s', correctionHealth.flat1sRows ?? []],
                    ['1m', correctionHealth.flat1mRows ?? []],
                    ['5m', correctionHealth.flat5mRows ?? []],
                ].flatMap(([label, rows3]) => rows3.map((row) => ({ ...row, label })));
                return (
                    <div className={styles.tableWrap}>
                        <table className={styles.table}>
                            <thead>
                                <tr>
                                    {['구분', '건수', '시작', '종료'].map(h => <th key={h} className={styles.th}>{h}</th>)}
                                </tr>
                            </thead>
                            <tbody>
                                {rows2.map(([label, count, minMs, maxMs]) => (
                                    <tr key={label}>
                                        <td className={`${styles.td} ${styles.mono}`}>{label}</td>
                                        <td className={`${styles.td} ${styles.mono}`}>{fmtNum(count)}</td>
                                        <td className={`${styles.td} ${styles.mono}`}>{fmtDateTime(minMs)}</td>
                                        <td className={`${styles.td} ${styles.mono}`}>{fmtDateTime(maxMs)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        <div className={styles.desc}>{correctionHealth.message}</div>
                        {flatRows.length > 0 && (
                            <table className={styles.table}>
                                <thead>
                                    <tr>
                                        {['구분', '시간', 'OHLC', '거래수'].map(h => <th key={h} className={styles.th}>{h}</th>)}
                                    </tr>
                                </thead>
                                <tbody>
                                    {flatRows.slice(0, 20).map((row, idx) => (
                                        <tr key={`${row.label}-${row.candle_time_ms}-${idx}`}>
                                            <td className={`${styles.td} ${styles.mono}`}>{row.label}</td>
                                            <td className={`${styles.td} ${styles.mono}`}>{fmtDateTime(row.candle_time_ms)}</td>
                                            <td className={`${styles.td} ${styles.mono}`}>
                                                {row.open_price}/{row.high_price}/{row.low_price}/{row.close_price}
                                            </td>
                                            <td className={`${styles.td} ${styles.mono}`}>{fmtNum(row.trade_count)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                );
            })()}
            {correctionResult && (
                <div className={styles.desc} style={{ color: 'var(--monitor-gauge-ok)' }}>
                    보정 완료 · 1m 삭제 {fmtNum(correctionResult.oneMinute?.deletedFlat)} / 생성 {fmtNum(correctionResult.oneMinute?.inserted)}
                    {' · '}5m flat 삭제 {fmtNum(correctionResult.fiveMinute?.deletedFlat)} / 영향 재생성 {fmtNum(correctionResult.fiveMinute?.insertedImpacted)}
                    {' · '}영향 5m {fmtNum(correctionResult.fiveMinute?.impacted5mCount)}건
                </div>
            )}
            <div className={styles.actions}>
                {chs.dlog(4, 'outlier 전용 symbol select 표시')}
                <select
                    className={styles.select}
                    value={outlierSymbol}
                    onChange={e => {
                        setOutlierSymbol(e.target.value);
                        resetOutlierResults();
                    }}
                    disabled={outlierLoading}
                >
                    {SYMBOLS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                {chs.dlog(4, 'outlier 전용 market select 표시')}
                <select
                    className={styles.select}
                    value={outlierMarket}
                    onChange={e => {
                        setOutlierMarket(e.target.value);
                        resetOutlierResults();
                    }}
                    disabled={outlierLoading}
                >
                    {MARKETS.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
                {chs.dlog(4, 'outlier 범위 선택에 직접 지정 옵션을 표시')}
                <select
                    className={styles.select}
                    value={outlierRangeKey}
                    onChange={e => setOutlierRangeKey(e.target.value)}
                    disabled={outlierLoading}
                >
                    {OUTLIER_RANGE_OPTIONS.map((option) => (
                        <option key={option.key} value={option.key}>{option.label}</option>
                    ))}
                </select>
                {chs.dlog(4, '직접 지정 옵션 선택 시 from datetime-local 입력을 표시')}
                {chs.dlog(4, '직접 지정 옵션 선택 시 to datetime-local 입력을 표시')}
                {outlierRangeKey === 'custom' && (
                    <>
                        <input
                            className={styles.input}
                            type="datetime-local"
                            value={outlierCustomFrom}
                            onChange={e => setOutlierCustomFrom(e.target.value)}
                            disabled={outlierLoading}
                            title="Outlier From"
                        />
                        <input
                            className={styles.input}
                            type="datetime-local"
                            value={outlierCustomTo}
                            onChange={e => setOutlierCustomTo(e.target.value)}
                            disabled={outlierLoading}
                            title="Outlier To"
                        />
                    </>
                )}
                <button
                    type="button"
                    className={styles.btn}
                    onClick={handleOutlierCorrectionHealth}
                    disabled={outlierLoading}
                >
                    {outlierLoading ? '처리 중...' : 'Outlier 진단'}
                </button>
                <button
                    type="button"
                    className={`${styles.btn} ${styles.btnActive}`}
                    onClick={handleOutlierCorrection}
                    disabled={outlierLoading || outlierMarket !== 'FUTURES'}
                    style={{ opacity: outlierLoading || outlierMarket !== 'FUTURES' ? 0.6 : 1 }}
                >
                    {outlierLoading ? '처리 중...' : 'Outlier 보정 실행'}
                </button>
            </div>
            {outlierError && <div className={styles.desc} style={{ color: 'var(--monitor-severity-critical)' }}>{outlierError}</div>}
            {outlierHealth && (
                <div className={styles.tableWrap}>
                    <div className={styles.desc}>
                        raw 불일치 1m {fmtNum(outlierHealth.outlier1mCount)}건 · 영향 5m {fmtNum(outlierHealth.impacted5mCount)}건
                        {outlierHealth.reasonSummary && (
                            <>
                                {' · '}
                                {Object.entries(outlierHealth.reasonSummary).map(([key, value]) => `${key} ${fmtNum(value)}`).join(' / ')}
                            </>
                        )}
                    </div>
                    {Array.isArray(outlierHealth.rows) && outlierHealth.rows.length > 0 && (
                        <table className={styles.table}>
                            <thead>
                                <tr>
                                    {chs.dlog(4, 'outlier 진단 테이블에 reason 컬럼을 표시')}
                                    {chs.dlog(4, 'outlier 진단 테이블에 agg와 raw 차이 핵심값을 표시')}
                                    {['시간', 'reason', 'agg OHLC', 'raw OHLC', 'max diff', 'agg/raw 거래수'].map(h => <th key={h} className={styles.th}>{h}</th>)}
                                </tr>
                            </thead>
                            <tbody>
                                {outlierHealth.rows.slice(0, 20).map((row, idx) => (
                                    <tr key={`${row.candle_time_ms}-${idx}`}>
                                        <td className={`${styles.td} ${styles.mono}`}>{fmtDateTime(row.candle_time_ms)}</td>
                                        <td className={`${styles.td} ${styles.mono}`}>{row.reason}</td>
                                        <td className={`${styles.td} ${styles.mono}`}>
                                            {row.open_price}/{row.high_price}/{row.low_price}/{row.close_price}
                                        </td>
                                        <td className={`${styles.td} ${styles.mono}`}>
                                            {row.raw_open}/{row.raw_high}/{row.raw_low}/{row.raw_close}
                                        </td>
                                        <td className={`${styles.td} ${styles.mono}`}>{row.max_price_diff}</td>
                                        <td className={`${styles.td} ${styles.mono}`}>
                                            {fmtNum(row.trade_count)}/{fmtNum(row.raw_trade_count)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            )}
            {outlierResult && (
                <div className={styles.desc} style={{ color: 'var(--monitor-gauge-ok)' }}>
                    Outlier 보정 완료 · 1m 삭제 {fmtNum(outlierResult.oneMinute?.deleted)} / 생성 {fmtNum(outlierResult.oneMinute?.inserted)}
                    {' · '}5m 삭제 {fmtNum(outlierResult.fiveMinute?.deleted)} / 생성 {fmtNum(outlierResult.fiveMinute?.inserted)}
                    {' · '}대상 1m {fmtNum(outlierResult.summary?.targetOneMinuteCount)}건 / 대상 5m {fmtNum(outlierResult.summary?.targetFiveMinuteCount)}건
                </div>
            )}
        </div>
    );
}
