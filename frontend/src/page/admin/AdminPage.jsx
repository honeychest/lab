// [AGENT] 역할: 데이터 누락 구간 조회 + 수동 수집 어드민 페이지 | 연관파일: DataGapAdminController.java, ManualBackfillController.java
// IP 인증: 마운트 시 /api/admin/data-gap/access 체크 → canAccess false면 접근 거부
// 갭 조회: /api/admin/data-gap/check?type=xxx → 결과 테이블, 체크박스로 행 선택 → [선택 수집] 버튼
// 수동 수집: /api/admin/backfill/collect → Job 폴링
import { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import Layout from '../../shared/ui/layout/Layout.jsx';

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

function datetimeLocalToMs(s) {
    if (!s) return null;
    return new Date(s).getTime();
}

export default function AdminPage() {
    // ── 접근 권한 ──────────────────────────────────────────────────────────
    const [canAccess, setCanAccess] = useState(null);

    // ── 갭 조회 ────────────────────────────────────────────────────────────
    const [activeKey, setActiveKey] = useState(null);
    const [rows, setRows]           = useState(null);
    const [columns, setColumns]     = useState([]);
    const [loading, setLoading]     = useState(false);
    const [error, setError]         = useState(null);

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

    const pollRef = useRef(null);

    useEffect(() => {
        axios.get('/api/admin/data-gap/access')
            .then(r => setCanAccess(r.data.canAccess))
            .catch(() => setCanAccess(false));
    }, []);

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
        return <Layout><div style={S.center}><span style={S.muted}>접근 권한 확인 중...</span></div></Layout>;
    }
    if (!canAccess) {
        return <Layout><div style={S.center}><span style={{ color: '#ef4444', fontSize: '14px' }}>접근 권한이 없습니다.</span></div></Layout>;
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
        <Layout>
            <div style={S.page}>
                <h2 style={S.title}>Data Admin</h2>

                {/* ─────────── 갭 조회 섹션 ─────────── */}
                <div style={S.sectionLabel}>갭 조회</div>
                <div style={S.btnGroup}>
                    {CHECKS.filter(c => !c.danger).map(({ type, label, desc, days }) => {
                        const key = `${type}_${days ?? 'all'}`;
                        return (
                            <button
                                key={key}
                                onClick={() => handleCheck(type, days)}
                                disabled={loading}
                                style={{ ...S.btn, ...(activeKey === key ? S.btnActive : {}) }}
                                title={desc}
                            >
                                {label}
                            </button>
                        );
                    })}
                </div>

                {activeKey && (
                    <p style={S.desc}>{activeCheck?.desc}{' · '}최대 20건 표시</p>
                )}

                <div style={S.resultBox}>
                    {loading && <span style={S.muted}>조회 중...</span>}
                    {!loading && error && <span style={{ color: '#ef4444' }}>{error}</span>}
                    {!loading && !error && rows === null && <span style={S.muted}>버튼을 클릭하면 누락 구간을 조회합니다.</span>}
                    {!loading && !error && rows !== null && rows.length === 0 && <span style={{ color: '#4ade80' }}>✓ 누락 없음</span>}
                    {!loading && !error && rows !== null && rows.length > 0 && (
                        <>
                            <div style={S.tableWrap}>
                                <table style={S.table}>
                                    <thead>
                                        <tr>
                                            {showCheckbox && (
                                                <th style={{ ...S.th, width: '32px' }}>
                                                    <input type="checkbox" checked={allChecked} onChange={toggleAll} />
                                                </th>
                                            )}
                                            {visibleColumns.map(col => <th key={col} style={S.th}>{col}</th>)}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {rows.map((row, i) => (
                                            <tr key={i} style={i % 2 === 0 ? S.trEven : S.trOdd}>
                                                {showCheckbox && (
                                                    <td style={{ ...S.td, width: '32px' }}>
                                                        <input
                                                            type="checkbox"
                                                            checked={selectedRows.has(i)}
                                                            onChange={() => toggleRow(i)}
                                                        />
                                                    </td>
                                                )}
                                                {visibleColumns.map(col => (
                                                    <td key={col} style={S.td}>
                                                        {row[col] != null ? String(row[col]) : '—'}
                                                    </td>
                                                ))}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            {showCheckbox && (
                                <div style={{ marginTop: '12px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                                    <button
                                        style={{
                                            ...S.btn,
                                            ...(selectedRows.size > 0 ? S.btnActive : {}),
                                            opacity: selectedRows.size === 0 || collectLoading ? 0.5 : 1,
                                        }}
                                        onClick={handleBulkCollect}
                                        disabled={selectedRows.size === 0 || collectLoading}
                                    >
                                        {collectLoading ? '요청 중...' : `선택 수집 (${selectedRows.size}건)`}
                                    </button>
                                    {collectError && <span style={{ color: '#ef4444', fontSize: '12px' }}>{collectError}</span>}
                                </div>
                            )}
                        </>
                    )}
                </div>

                {/* ─────────── 수동 수집 섹션 ─────────── */}
                <div style={{ marginTop: '32px' }}>
                    <div style={S.sectionLabel}>수동 수집</div>

                    {/* 셀렉터 행 */}
                    <div style={S.row}>
                        <select style={S.select} value={cType} onChange={e => setCType(e.target.value)}>
                            <option value="RAW_AGG_TRADE">Raw AggTrade</option>
                            <option value="AGG_1M">1분봉</option>
                            <option value="AGG_5M">5분봉</option>
                            <option value="OI">Open Interest</option>
                        </select>
                        <select style={S.select} value={cSymbol} onChange={e => setCSymbol(e.target.value)}>
                            {SYMBOLS.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                        <select
                            style={{ ...S.select, opacity: noMarket ? 0.4 : 1 }}
                            value={noMarket ? 'FUTURES' : cMarket}
                            disabled={noMarket}
                            onChange={e => setCMarket(e.target.value)}
                        >
                            {MARKETS.map(m => <option key={m} value={m}>{m}</option>)}
                        </select>
                    </div>

                    {/* 범위 입력 행 */}
                    <div style={{ ...S.row, marginTop: '12px', alignItems: 'flex-end' }}>
                        <div style={S.inputGroup}>
                            <label style={S.inputLabel}>{isIdBased ? 'From ID' : 'From'}</label>
                            {isIdBased
                                ? <input style={S.input} type="number" value={cFrom} onChange={e => setCFrom(e.target.value)} placeholder="시작 ID" />
                                : <input style={S.input} type="datetime-local" value={cFrom} onChange={e => setCFrom(e.target.value)} />
                            }
                        </div>
                        <div style={S.inputGroup}>
                            <label style={S.inputLabel}>{isIdBased ? 'To ID' : 'To'}</label>
                            {isIdBased
                                ? <input style={S.input} type="number" value={cTo} onChange={e => setCTo(e.target.value)} placeholder="종료 ID (생략 시 현재)" />
                                : <input style={S.input} type="datetime-local" value={cTo} onChange={e => setCTo(e.target.value)} />
                            }
                        </div>
                        <button
                            style={{ ...S.btn, ...S.btnCollect }}
                            onClick={handleCollect}
                            disabled={collectLoading || !cFrom}
                        >
                            {collectLoading ? '요청 중...' : '수집 시작'}
                        </button>
                    </div>

                    {collectError && <p style={{ color: '#ef4444', fontSize: '12px', marginTop: '8px' }}>{collectError}</p>}

                    {/* Job 목록 */}
                    {jobs.length > 0 && (
                        <div style={{ marginTop: '16px' }}>
                            <div style={{ ...S.sectionLabel, fontSize: '11px', marginBottom: '8px' }}>수집 이력</div>
                            <div style={S.tableWrap}>
                                <table style={S.table}>
                                    <thead>
                                        <tr>
                                            {['jobId', '타입', '심볼', '마켓', '상태', '삽입', '시작', '완료'].map(h => (
                                                <th key={h} style={S.th}>{h}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {jobs.map((j, i) => (
                                            <tr key={j.jobId} style={i % 2 === 0 ? S.trEven : S.trOdd}>
                                                <td style={S.td}>{j.jobId}</td>
                                                <td style={S.td}>{j.type}</td>
                                                <td style={S.td}>{j.symbol}</td>
                                                <td style={S.td}>{j.marketType}</td>
                                                <td style={{ ...S.td, color: statusColor(j.status), fontWeight: 600 }}>
                                                    {j.status}
                                                    {j.status === 'ERROR' && j.message &&
                                                        <span style={{ color: '#94a3b8', fontWeight: 400 }}>{' '}{j.message.slice(0, 40)}</span>
                                                    }
                                                </td>
                                                <td style={S.td}>{j.inserted > 0 ? fmtNum(j.inserted) : '—'}</td>
                                                <td style={S.td}>{fmtTime(j.startedAt)}</td>
                                                <td style={S.td}>{j.finishedAt ? fmtTime(j.finishedAt) : j.status === 'RUNNING' ? '진행 중' : '—'}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </div>
            </div>

                {/* ─────────── 위험 구역 ─────────── */}
                <div style={S.dangerZone}>
                    <div style={S.dangerLabel}>⚠ 느린 조회 (주의)</div>
                    <div style={S.btnGroup}>
                        {CHECKS.filter(c => c.danger).map(({ type, label, desc, days }) => {
                            const key = `${type}_${days ?? 'all'}`;
                            return (
                                <button
                                    key={key}
                                    onClick={() => handleCheck(type, days)}
                                    disabled={loading}
                                    style={{ ...S.btn, ...S.btnDanger, ...(activeKey === key ? S.btnDangerActive : {}) }}
                                    title={desc}
                                >
                                    {label}
                                </button>
                            );
                        })}
                    </div>
                </div>
        </Layout>
    );
}

const S = {
    page: {
        minHeight: '100%',
        background: '#0a0f1e',
        padding: '32px',
        boxSizing: 'border-box',
    },
    title: {
        color: '#e5e7eb',
        fontSize: '18px',
        fontWeight: 700,
        marginBottom: '24px',
    },
    sectionLabel: {
        color: '#475569',
        fontSize: '12px',
        fontWeight: 600,
        letterSpacing: '0.05em',
        textTransform: 'uppercase',
        marginBottom: '10px',
    },
    btnGroup: {
        display: 'flex',
        gap: '8px',
        flexWrap: 'wrap',
        marginBottom: '12px',
    },
    row: {
        display: 'flex',
        gap: '8px',
        flexWrap: 'wrap',
        alignItems: 'center',
        marginBottom: '0',
    },
    btn: {
        padding: '8px 16px',
        borderRadius: '8px',
        border: '1px solid #1e293b',
        background: '#0f172a',
        color: '#94a3b8',
        fontSize: '13px',
        fontWeight: 600,
        cursor: 'pointer',
        transition: 'all 0.15s',
        whiteSpace: 'nowrap',
    },
    btnActive: {
        border: '1px solid #3b82f6',
        color: '#e5e7eb',
        background: '#1e3a5f',
    },
    btnCollect: {
        background: '#1e3a5f',
        border: '1px solid #3b82f6',
        color: '#e5e7eb',
        alignSelf: 'flex-end',
    },
    select: {
        padding: '8px 12px',
        borderRadius: '8px',
        border: '1px solid #1e293b',
        background: '#0f172a',
        color: '#e5e7eb',
        fontSize: '13px',
        cursor: 'pointer',
        outline: 'none',
    },
    inputGroup: {
        display: 'flex',
        flexDirection: 'column',
        gap: '4px',
    },
    inputLabel: {
        color: '#475569',
        fontSize: '11px',
        fontWeight: 600,
    },
    input: {
        padding: '8px 12px',
        borderRadius: '8px',
        border: '1px solid #1e293b',
        background: '#0f172a',
        color: '#e5e7eb',
        fontSize: '13px',
        outline: 'none',
        minWidth: '200px',
    },
    desc: {
        color: '#475569',
        fontSize: '12px',
        marginBottom: '16px',
    },
    resultBox: {
        minHeight: '120px',
        background: '#0f172a',
        border: '1px solid #1e293b',
        borderRadius: '12px',
        padding: '20px',
        display: 'flex',
        flexDirection: 'column',
    },
    muted: {
        color: '#475569',
        fontSize: '13px',
    },
    tableWrap: {
        overflowX: 'auto',
    },
    table: {
        width: '100%',
        borderCollapse: 'collapse',
        fontSize: '12px',
        fontFamily: 'monospace',
    },
    th: {
        textAlign: 'left',
        padding: '6px 12px',
        color: '#475569',
        borderBottom: '1px solid #1e293b',
        whiteSpace: 'nowrap',
    },
    td: {
        padding: '6px 12px',
        color: '#e5e7eb',
        whiteSpace: 'nowrap',
    },
    trEven: { background: 'transparent' },
    trOdd:  { background: '#0a0f1e' },
    center: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100%',
        background: '#0a0f1e',
    },
    dangerZone: {
        marginTop: '48px',
        padding: '16px',
        border: '1px dashed #3f2020',
        borderRadius: '10px',
        background: '#0f0a0a',
        alignSelf: 'flex-start',
        display: 'inline-block',
    },
    dangerLabel: {
        color: '#7f3a3a',
        fontSize: '11px',
        fontWeight: 600,
        letterSpacing: '0.05em',
        textTransform: 'uppercase',
        marginBottom: '10px',
    },
    btnDanger: {
        border: '1px solid #3f2020',
        color: '#7f3a3a',
        background: '#0f0a0a',
    },
    btnDangerActive: {
        border: '1px solid #ef4444',
        color: '#fca5a5',
        background: '#3f1010',
    },
};
