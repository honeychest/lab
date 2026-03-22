// [AGENT] 역할: 데이터 누락 구간 조회 + 수동 수집 어드민 페이지 | 연관파일: DataGapAdminController.java, ManualBackfillController.java
// IP 인증: 마운트 시 /api/admin/data-gap/access 체크 → canAccess false면 접근 거부
// 갭 조회: /api/admin/data-gap/check?type=xxx → 결과 테이블, 체크박스로 행 선택 → [선택 수집] 버튼
// 수동 수집: /api/admin/backfill/collect → Job 폴링
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import Layout from '../../shared/ui/layout/Layout.jsx';
import styles from './AdminPage.module.css';
import '../../styles/themes/monitor-teal.css';

const CHECKS = [
    { type: 'RAW_AGG_TRADE', label: 'Raw AggTrade (7일)', days: 7,    desc: 'agg_trade_id 연속성 갭 · 최근 7일' },
    { type: 'RAW_AGG_TRADE', label: 'Raw AggTrade (전체)', days: null, desc: 'agg_trade_id 연속성 갭 · 전체 (느림)', danger: true },
    { type: 'AGG_1M',        label: '1분봉',               days: null, desc: 'candle_time_ms 1분 간격 초과' },
    { type: 'AGG_5M',        label: '5분봉',               days: null, desc: 'candle_time_ms 5분 간격 초과' },
    { type: 'OI',            label: 'Open Interest',      days: null, desc: '10분 이상 공백' },
];

const SYMBOLS   = ['BTCUSDT', 'ENAUSDT'];
const MARKETS   = ['SPOT', 'FUTURES'];
// FORCE_ORDER·OI는 marketType 불필요
const NO_MARKET = new Set(['FORCE_ORDER', 'OI']);
// RAW_AGG_TRADE는 ID 기반, 나머지는 시간 기반
const ID_BASED  = new Set(['RAW_AGG_TRADE']);

const fmtTtl = (ttlSeconds) => {
    const n = Number(ttlSeconds);
    if (!Number.isFinite(n) || n <= 0) return '만료';
    return `${Math.ceil(n / 60)}분 후`;
};

function datetimeLocalToMs(s) {
    if (!s) return null;
    return new Date(s).getTime();
}

function msToDatetimeLocal(ms) {
    const d = new Date(ms);
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function AdminPage() {
    const navigate = useNavigate();
    // ── 접근 권한 ──────────────────────────────────────────────────────────
    const [canAccess, setCanAccess] = useState(null);

    // ── 기능 토글 (Redis) ────────────────────────────────────────────────
    const [flags, setFlags] = useState({ tradeThresholdEdit: true, monitorAllowedIpManage: false });
    const [flagsLoading, setFlagsLoading] = useState(false);

    // ── 갭 조회 ────────────────────────────────────────────────────────────
    const [activeKey, setActiveKey] = useState(null);
    const [rows, setRows]           = useState(null);
    const [columns, setColumns]     = useState([]);
    const [loading, setLoading]     = useState(false);
    const [error, setError]         = useState(null);

    // ── 롤업 ───────────────────────────────────────────────────────────────
    const [rFrom,    setRFrom]    = useState(() => msToDatetimeLocal(Date.now() - 7 * 24 * 60 * 60 * 1000));
    const [rTo,      setRTo]      = useState(() => msToDatetimeLocal(Date.now()));
    const [rLoading, setRLoading] = useState(false);
    const [rResult,  setRResult]  = useState(null); // { ok, inserted1m, inserted5m } | { ok: false, message }

    // ── 수동 수집 ──────────────────────────────────────────────────────────
    const [cType,    setCType]    = useState('RAW_AGG_TRADE');
    const [cSymbol,  setCSymbol]  = useState('BTCUSDT');
    const [cMarket,  setCMarket]  = useState('SPOT');
    const [cFrom,    setCFrom]    = useState('');
    const [cTo,      setCTo]      = useState('');
    const [collectLoading, setCollectLoading] = useState(false);
    const [collectError,   setCollectError]   = useState(null);
    const [jobs,     setJobs]     = useState([]);

    const [selectedRows, setSelectedRows] = useState(new Set());

    // ── 허용 IP 관리 ─────────────────────────────────────────────────────────
    const [allowedIps, setAllowedIps] = useState([]);
    const [allowedLoading, setAllowedLoading] = useState(false);
    const [allowedError, setAllowedError] = useState(null);

    const pollRef = useRef(null);

    useEffect(() => {
        axios.get('/api/admin/data-gap/access')
            .then(r => setCanAccess(r.data.canAccess))
            .catch((e) => {
                if (e?.response?.status === 403) {
                    navigate('/forbidden', { replace: true });
                    return;
                }
                setCanAccess(false);
            });
    }, [navigate]);

    useEffect(() => {
        setFlagsLoading(true);
        axios.get('/api/admin/feature-flags')
            .then(r => setFlags(r.data))
            .catch(() => {})
            .finally(() => setFlagsLoading(false));
    }, []);

    const patchFlags = async (next) => {
        setFlags(next);
        try {
            const r = await axios.patch('/api/admin/feature-flags', next);
            setFlags(r.data);
        } catch {
            // ignore
        }
    };

    const loadAllowedIps = async () => {
        setAllowedLoading(true);
        setAllowedError(null);
        try {
            const r = await axios.get('/api/admin/monitor/allowed-ips');
            setAllowedIps(r.data ?? []);
        } catch (e) {
            setAllowedIps([]);
            setAllowedError(e?.response?.status === 403 ? '기능이 비활성화되어 있습니다.' : '허용 IP 조회 실패');
        } finally {
            setAllowedLoading(false);
        }
    };

    const handleDeleteAllowedIp = async (ip) => {
        if (!ip) return;
        setAllowedLoading(true);
        setAllowedError(null);
        try {
            await axios.delete(`/api/admin/monitor/allowed-ips/${encodeURIComponent(ip)}`);
            await loadAllowedIps();
        } catch (e) {
            setAllowedError(e?.response?.status === 403 ? '기능이 비활성화되어 있습니다.' : '허용 IP 삭제 실패');
            setAllowedLoading(false);
        }
    };

    // RUNNING job 있으면 3초 폴링
    useEffect(() => {
        const hasRunning = jobs.some(j => j.status === 'RUNNING');
        if (hasRunning && !pollRef.current) {
            pollRef.current = setInterval(() => {
                axios.get('/api/admin/backfill/jobs').then(r => setJobs(r.data)).catch(() => {});
            }, 3000);
        } else if (!hasRunning && pollRef.current) {
            clearInterval(pollRef.current);
            pollRef.current = null;
        }
        return () => {};
    }, [jobs]);

    // 언마운트 시 폴링 정리
    useEffect(() => () => {
        if (pollRef.current) clearInterval(pollRef.current);
    }, []);

    // ── 허용 IP 목록 초기 로딩 (토글 ON일 때만) ────────────────────────────────
    useEffect(() => {
        if (!flags.monitorAllowedIpManage) return;
        loadAllowedIps();
    }, [flags.monitorAllowedIpManage]);

    // ── 갭 조회 핸들러 ─────────────────────────────────────────────────────
    const handleCheck = async (type, days) => {
        const key = `${type}_${days ?? 'all'}`;
        setActiveKey(key);
        setRows(null);
        setSelectedRows(new Set());
        setError(null);
        setLoading(true);
        try {
            const params = days != null ? { type, days } : { type };
            const r = await axios.get('/api/admin/data-gap/check', { params });
            const data = r.data;
            setRows(data);
            setColumns(data.length > 0 ? Object.keys(data[0]) : []);
        } catch (e) {
            setError(e.response?.data?.error ?? '조회 실패');
        } finally {
            setLoading(false);
        }
    };

    // ── 선택 수집 ──────────────────────────────────────────────────────────
    const handleBulkCollect = async () => {
        if (selectedRows.size === 0 || !activeCheck) return;
        const selected = [...selectedRows].map(i => rows[i]);
        const isIdBased = ID_BASED.has(activeCheck.type);

        // symbol+market_type 그룹핑
        const groups = {};
        for (const row of selected) {
            const sym    = row.symbol ?? cSymbol;
            const market = row.market_type ?? 'FUTURES';
            const key    = `${sym}__${market}`;
            if (!groups[key]) groups[key] = { symbol: sym, marketType: market, rows: [] };
            groups[key].rows.push(row);
        }

        setCollectError(null);
        setCollectLoading(true);
        try {
            for (const g of Object.values(groups)) {
                const body = { type: activeCheck.type, symbol: g.symbol, marketType: g.marketType };
                if (isIdBased) {
                    body.fromId = Math.min(...g.rows.map(r => Number(r.gap_start_id)));
                    body.toId   = Math.max(...g.rows.map(r => Number(r.gap_end_id)));
                } else {
                    body.fromMs = Math.min(...g.rows.map(r => Number(r.gap_start_ms)));
                    body.toMs   = Math.max(...g.rows.map(r => Number(r.gap_end_ms)));
                }
                await axios.post('/api/admin/backfill/collect', body);
            }
            const jobs2 = await axios.get('/api/admin/backfill/jobs');
            setJobs(jobs2.data);
            setSelectedRows(new Set());
            if (activeCheck) handleCheck(activeCheck.type, activeCheck.days);
        } catch (e) {
            setCollectError(e.response?.data?.error ?? '수집 요청 실패');
        } finally {
            setCollectLoading(false);
        }
    };

    // ── 롤업 실행 ──────────────────────────────────────────────────────────
    const handleRollup = async () => {
        setRLoading(true);
        setRResult(null);
        try {
            const r = await axios.post('/api/admin/aggtrade/rollup', {
                fromMs: datetimeLocalToMs(rFrom),
                toMs:   datetimeLocalToMs(rTo),
            });
            setRResult({ ok: true, ...r.data });
        } catch (e) {
            setRResult({ ok: false, message: e.response?.data?.error ?? '롤업 실패' });
        } finally {
            setRLoading(false);
        }
    };

    // ── 수집 시작 (수동 입력) ──────────────────────────────────────────────
    const handleCollect = async () => {
        setCollectError(null);
        setCollectLoading(true);
        try {
            const body = { type: cType, symbol: cSymbol, marketType: cMarket };
            if (ID_BASED.has(cType)) {
                if (cFrom) body.fromId = Number(cFrom);
                if (cTo)   body.toId   = Number(cTo);
            } else {
                if (cFrom) body.fromMs = datetimeLocalToMs(cFrom);
                if (cTo)   body.toMs   = datetimeLocalToMs(cTo);
            }
            await axios.post('/api/admin/backfill/collect', body);
            const jobs2 = await axios.get('/api/admin/backfill/jobs');
            setJobs(jobs2.data);
        } catch (e) {
            setCollectError(e.response?.data?.error ?? '수집 요청 실패');
        } finally {
            setCollectLoading(false);
        }
    };

    // ── 표시 전용 헬퍼 ────────────────────────────────────────────────────
    const activeCheck = CHECKS.find(c => `${c.type}_${c.days ?? 'all'}` === activeKey);
    const isIdBased   = ID_BASED.has(cType);
    const noMarket    = NO_MARKET.has(cType);

    const fmtNum  = n => n != null ? Number(n).toLocaleString() : '—';
    const fmtTime = ms => ms != null ? new Date(Number(ms)).toLocaleTimeString() : '—';

    const statusColor = s => ({ RUNNING: '#60a5fa', DONE: '#4ade80', ERROR: '#ef4444' }[s] ?? '#94a3b8');

    // ── 접근 체크 중 ──────────────────────────────────────────────────────
    if (canAccess === null) {
        return (
            <Layout footerCenter={['Admin', 'Redis', 'MySQL', 'Backfill']} enableSupport={false}>
                <div className={styles.page}>
                    <div className={styles.card}>
                        <div className={styles.muted}>접근 권한 확인 중...</div>
                    </div>
                </div>
            </Layout>
        );
    }
    if (!canAccess) {
        return (
            <Layout footerCenter={['Admin', 'Redis', 'MySQL', 'Backfill']} enableSupport={false}>
                <div className={styles.page}>
                    <div className={styles.card}>
                        <div className={styles.title}>접근 권한이 없습니다.</div>
                    </div>
                </div>
            </Layout>
        );
    }

    // 체크박스 표시 여부: start/end 범위 컬럼이 있어야 수집 가능
    const showCheckbox = rows && rows.length > 0 && activeCheck &&
        (ID_BASED.has(activeCheck.type)
            ? rows[0].gap_start_id != null
            : rows[0].gap_start_ms != null);

    const allChecked = showCheckbox && selectedRows.size === rows.length;
    const toggleAll  = () => setSelectedRows(allChecked ? new Set() : new Set(rows.map((_, i) => i)));
    const toggleRow  = i  => setSelectedRows(prev => {
        const next = new Set(prev);
        next.has(i) ? next.delete(i) : next.add(i);
        return next;
    });

    // 갭 결과 컬럼에서 _ms 접미사 컬럼은 숨김 (raw 값, 사용자 노출 불필요)
    const visibleColumns = columns.filter(c => !c.endsWith('_ms'));

    return (
        <Layout footerCenter={['Admin', 'Redis', 'MySQL', 'Backfill']} enableSupport={false}>
            <div className={styles.page}>
                <div className={styles.grid}>
                    <section className={styles.main}>

                        <div className={styles.card}>
                            <div className={styles.titleRow}>
                                <div className={styles.title}>갭 조회</div>
                                <div className={styles.subtitle}>최대 20건 표시</div>
                            </div>
                            <div className={styles.btnRow}>
                                {CHECKS.filter(c => !c.danger).map(({ type, label, desc, days }) => {
                                    const key = `${type}_${days ?? 'all'}`;
                                    const active = activeKey === key;
                                    return (
                                        <button
                                            key={key}
                                            type="button"
                                            className={`${styles.btn} ${active ? styles.btnActive : ''}`}
                                            onClick={() => handleCheck(type, days)}
                                            disabled={loading}
                                            title={desc}
                                        >
                                            {label}
                                        </button>
                                    );
                                })}
                            </div>
                            {activeKey && <p className={styles.desc}>{activeCheck?.desc}{' · '}최대 20건 표시</p>}

                            {loading && <div className={styles.muted}>조회 중...</div>}
                            {!loading && error && <div className={styles.muted} style={{ color: 'var(--monitor-severity-critical)' }}>{error}</div>}
                            {!loading && !error && rows === null && <div className={styles.muted}>버튼을 클릭하면 누락 구간을 조회합니다.</div>}
                            {!loading && !error && rows !== null && rows.length === 0 && (
                                <div className={styles.muted} style={{ color: 'var(--monitor-gauge-ok)' }}>✓ 누락 없음</div>
                            )}

                            {!loading && !error && rows !== null && rows.length > 0 && (
                                <div className={styles.tableWrap}>
                                    <table className={styles.table}>
                                        <thead>
                                            <tr>
                                                {showCheckbox && (
                                                    <th className={styles.th} style={{ width: '32px' }}>
                                                        <input type="checkbox" checked={allChecked} onChange={toggleAll} />
                                                    </th>
                                                )}
                                                {visibleColumns.map(col => <th key={col} className={styles.th}>{col}</th>)}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {rows.map((row, i) => (
                                                <tr key={i} className={i % 2 === 1 ? styles.trOdd : ''}>
                                                    {showCheckbox && (
                                                        <td className={styles.td} style={{ width: '32px' }}>
                                                            <input
                                                                type="checkbox"
                                                                checked={selectedRows.has(i)}
                                                                onChange={() => toggleRow(i)}
                                                            />
                                                        </td>
                                                    )}
                                                    {visibleColumns.map(col => (
                                                        <td key={col} className={`${styles.td} ${styles.mono}`}>
                                                            {row[col] != null ? String(row[col]) : '—'}
                                                        </td>
                                                    ))}
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}

                            {showCheckbox && (
                                <div className={styles.actions}>
                                    <button
                                        type="button"
                                        className={`${styles.btn} ${selectedRows.size > 0 ? styles.btnActive : ''}`}
                                        onClick={handleBulkCollect}
                                        disabled={selectedRows.size === 0 || collectLoading}
                                        style={{ opacity: selectedRows.size === 0 || collectLoading ? 0.6 : 1 }}
                                    >
                                        {collectLoading ? '요청 중...' : `선택 수집 (${selectedRows.size}건)`}
                                    </button>
                                    {collectError && <div className={styles.muted} style={{ color: 'var(--monitor-severity-critical)' }}>{collectError}</div>}
                                </div>
                            )}
                        </div>

                        <div className={styles.card}>
                            <div className={styles.titleRow}>
                                <div className={styles.title}>롤업</div>
                                <div className={styles.subtitle}>1s → 1m → 5m 수동 실행</div>
                            </div>
                            <div className={styles.inputRow}>
                                <div className={styles.field}>
                                    <div className={styles.label}>From</div>
                                    <input className={styles.input} type="datetime-local" value={rFrom} onChange={e => setRFrom(e.target.value)} />
                                </div>
                                <div className={styles.field}>
                                    <div className={styles.label}>To</div>
                                    <input className={styles.input} type="datetime-local" value={rTo} onChange={e => setRTo(e.target.value)} />
                                </div>
                                <div className={styles.field}>
                                    <div className={styles.label}>Action</div>
                                    <button
                                        type="button"
                                        className={`${styles.btn} ${styles.btnActive}`}
                                        onClick={handleRollup}
                                        disabled={rLoading || !rFrom || !rTo}
                                        style={{ width: '100%', justifyContent: 'center' }}
                                    >
                                        {rLoading ? '실행 중...' : '롤업 실행'}
                                    </button>
                                </div>
                            </div>
                            {rResult && (
                                <div className={styles.desc} style={{ color: rResult.ok ? 'var(--monitor-gauge-ok)' : 'var(--monitor-severity-critical)' }}>
                                    {rResult.ok
                                        ? `완료 — 1m: ${fmtNum(rResult.inserted1m)}건, 5m: ${fmtNum(rResult.inserted5m)}건`
                                        : rResult.message}
                                </div>
                            )}
                        </div>

                        <div className={styles.card}>
                            <div className={styles.titleRow}>
                                <div className={styles.title}>수동 수집</div>
                                <div className={styles.subtitle}>Job 폴링 3초</div>
                            </div>

                            <div className={styles.inputRow}>
                                <div className={styles.field}>
                                    <div className={styles.label}>Type</div>
                                    <select className={styles.select} value={cType} onChange={e => setCType(e.target.value)}>
                                        <option value="RAW_AGG_TRADE">Raw AggTrade</option>
                                        <option value="AGG_1M">1분봉</option>
                                        <option value="AGG_5M">5분봉</option>
                                        <option value="OI">Open Interest</option>
                                    </select>
                                </div>
                                <div className={styles.field}>
                                    <div className={styles.label}>Symbol</div>
                                    <select className={styles.select} value={cSymbol} onChange={e => setCSymbol(e.target.value)}>
                                        {SYMBOLS.map(s => <option key={s} value={s}>{s}</option>)}
                                    </select>
                                </div>
                                <div className={styles.field}>
                                    <div className={styles.label}>Market</div>
                                    <select
                                        className={styles.select}
                                        value={noMarket ? 'FUTURES' : cMarket}
                                        disabled={noMarket}
                                        onChange={e => setCMarket(e.target.value)}
                                        style={{ opacity: noMarket ? 0.5 : 1 }}
                                    >
                                        {MARKETS.map(m => <option key={m} value={m}>{m}</option>)}
                                    </select>
                                </div>
                            </div>

                            <div className={styles.inputRow} style={{ marginTop: '10px' }}>
                                <div className={styles.field}>
                                    <div className={styles.label}>{isIdBased ? 'From ID' : 'From'}</div>
                                    {isIdBased
                                        ? <input className={styles.input} type="number" value={cFrom} onChange={e => setCFrom(e.target.value)} placeholder="시작 ID" />
                                        : <input className={styles.input} type="datetime-local" value={cFrom} onChange={e => setCFrom(e.target.value)} />
                                    }
                                </div>
                                <div className={styles.field}>
                                    <div className={styles.label}>{isIdBased ? 'To ID' : 'To'}</div>
                                    {isIdBased
                                        ? <input className={styles.input} type="number" value={cTo} onChange={e => setCTo(e.target.value)} placeholder="종료 ID (생략 시 현재)" />
                                        : <input className={styles.input} type="datetime-local" value={cTo} onChange={e => setCTo(e.target.value)} />
                                    }
                                </div>
                                <div className={styles.field}>
                                    <div className={styles.label}>Action</div>
                                    <button
                                        type="button"
                                        className={`${styles.btn} ${styles.btnActive}`}
                                        onClick={handleCollect}
                                        disabled={collectLoading || !cFrom}
                                        style={{ width: '100%', justifyContent: 'center' }}
                                    >
                                        {collectLoading ? '요청 중...' : '수집 시작'}
                                    </button>
                                </div>
                            </div>

                            {collectError && <div className={styles.desc} style={{ color: 'var(--monitor-severity-critical)' }}>{collectError}</div>}

                            {jobs.length > 0 && (
                                <div className={styles.tableWrap}>
                                    <table className={styles.table}>
                                        <thead>
                                            <tr>
                                                {['jobId', '타입', '심볼', '마켓', '상태', '삽입', '시작', '완료'].map(h => (
                                                    <th key={h} className={styles.th}>{h}</th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {jobs.map((j, i) => (
                                                <tr key={j.jobId} className={i % 2 === 1 ? styles.trOdd : ''}>
                                                    <td className={`${styles.td} ${styles.mono}`}>{j.jobId}</td>
                                                    <td className={`${styles.td} ${styles.mono}`}>{j.type}</td>
                                                    <td className={`${styles.td} ${styles.mono}`}>{j.symbol}</td>
                                                    <td className={`${styles.td} ${styles.mono}`}>{j.marketType}</td>
                                                    <td className={styles.td} style={{ color: statusColor(j.status) }}>{j.status}</td>
                                                    <td className={`${styles.td} ${styles.mono}`}>{j.inserted > 0 ? fmtNum(j.inserted) : '—'}</td>
                                                    <td className={`${styles.td} ${styles.mono}`}>{fmtTime(j.startedAt)}</td>
                                                    <td className={`${styles.td} ${styles.mono}`}>{j.finishedAt ? fmtTime(j.finishedAt) : j.status === 'RUNNING' ? '진행 중' : '—'}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>

                        <div className={`${styles.card}`}>
                            <div className={styles.titleRow}>
                                <div className={styles.title}>느린 조회</div>
                                <div className={styles.subtitle}>주의</div>
                            </div>
                            <div className={styles.btnRow}>
                                {CHECKS.filter(c => c.danger).map(({ type, label, desc, days }) => {
                                    const key = `${type}_${days ?? 'all'}`;
                                    const active = activeKey === key;
                                    return (
                                        <button
                                            key={key}
                                            type="button"
                                            className={`${styles.btn} ${styles.btnDanger} ${active ? styles.btnActive : ''}`}
                                            onClick={() => handleCheck(type, days)}
                                            disabled={loading}
                                            title={desc}
                                        >
                                            {label}
                                        </button>
                                    );
                                })}
                            </div>
                            <div className={styles.desc}>전체 RawAggTrade 조회는 서버 부하가 클 수 있습니다.</div>
                        </div>
                    </section>

                    <aside className={styles.sidebar}>
                        <div className={styles.card}>
                            <div className={styles.titleRow}>
                                <div className={styles.title}>Feature Flags</div>
                                <div className={styles.subtitle}>Redis 저장</div>
                            </div>
                            {flagsLoading ? (
                                <div className={styles.muted}>불러오는 중...</div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                    <label className={styles.flagRow}>
                                        <span className={styles.flagLabel}>Trade 임계값 변경 UI</span>
                                        <input
                                            type="checkbox"
                                            checked={!!flags.tradeThresholdEdit}
                                            onChange={(e) => patchFlags({ ...flags, tradeThresholdEdit: e.target.checked })}
                                        />
                                    </label>
                                    <label className={styles.flagRow}>
                                        <span className={styles.flagLabel}>Monitor 허용 IP 관리</span>
                                        <input
                                            type="checkbox"
                                            checked={!!flags.monitorAllowedIpManage}
                                            onChange={(e) => patchFlags({ ...flags, monitorAllowedIpManage: e.target.checked })}
                                        />
                                    </label>
                                    <div className={styles.desc}>
                                        추후 페이지 단위 차단도 이 방식으로 확장 가능합니다.
                                    </div>
                                </div>
                            )}
                        </div>

                        {flags.monitorAllowedIpManage && (
                            <div className={styles.card}>
                                <div className={styles.titleRow}>
                                    <div className={styles.title}>허용 IP</div>
                                    <button
                                        type="button"
                                        className={`${styles.btn} ${styles.btnActive}`}
                                        onClick={loadAllowedIps}
                                        disabled={allowedLoading}
                                        style={{ marginLeft: 'auto' }}
                                    >
                                        {allowedLoading ? '새로고침 중...' : '새로고침'}
                                    </button>
                                </div>
                                {allowedError && (
                                    <div className={styles.muted} style={{ color: 'var(--monitor-severity-critical)' }}>
                                        {allowedError}
                                    </div>
                                )}
                                {!allowedLoading && !allowedError && allowedIps.length === 0 && (
                                    <div className={styles.muted}>현재 허용된 IP가 없습니다.</div>
                                )}
                                {!allowedLoading && allowedIps.length > 0 && (
                                    <ul className={styles.ipList}>
                                        {allowedIps.map((x) => (
                                            <li key={x.ip} className={styles.ipItem}>
                                                <div className={styles.ipLeft}>
                                                    <div className={styles.ip}>{x.ip}</div>
                                                    <div className={styles.ttl}>잔여: {fmtTtl(x.ttlSeconds)}</div>
                                                </div>
                                                <button
                                                    type="button"
                                                    className={styles.del}
                                                    onClick={() => handleDeleteAllowedIp(x.ip)}
                                                    disabled={allowedLoading}
                                                >
                                                    삭제
                                                </button>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                        )}
                    </aside>
                </div>
            </div>
        </Layout>
    );
}
