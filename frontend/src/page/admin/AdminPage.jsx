// [AGENT] 역할: 데이터 누락 구간 조회 + 수동 수집/보정 + 방문자 이력 어드민 페이지 | 연관파일: DataGapAdminController.java, ManualBackfillController.java, MonitorApiController.java
// IP 인증: 마운트 시 /api/admin/data-gap/access 체크 → canAccess false면 접근 거부
// 갭 조회: /api/admin/data-gap/check?type=xxx → 결과 테이블, 체크박스로 행 선택 → [선택 수집] 버튼
// 수동 수집: /api/admin/backfill/collect → Job 폴링 | flat/outlier 보정: /api/admin/backfill/*-correction
// Outlier: 전용 symbol/market select 값으로 진단/보정 API 호출, 실행 시 갭 조회 결과와 분리
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import apiClient from '@/api/apiClient.js';
import chs from '@/global/chs';
import Layout from '../../shared/ui/layout/Layout.jsx';
import styles from './AdminPage.module.css';
import '../../styles/themes/monitor-teal.css';
import { VISUAL_EFFECT_SAMPLES } from '@/shared/ui/samples/visualSamples';

const CHECKS = [
    { type: 'RAW_AGG_TRADE', label: 'Raw AggTrade (7일)', days: 7,    desc: 'agg_trade_id 연속성 갭 · 최근 7일' },
    { type: 'AGG_1M',        label: '1분봉',               days: null, desc: 'candle_time_ms 1분 간격 초과' },
    { type: 'AGG_5M',        label: '5분봉',               days: null, desc: 'candle_time_ms 5분 간격 초과' },
    { type: 'OI',            label: 'Open Interest',      days: null, desc: '10분 이상 공백' },
];

const HEALTH_HOURS_OPTIONS = [1, 2, 4, 12, 24, 48];
const OUTLIER_RANGE_OPTIONS = [
    { key: 'current', label: '선택 범위(최대 48시간)', useHealthHours: true },
    { key: 'custom', label: '직접 지정' },
    { key: '48_96', label: '48~96시간 전', fromHours: 96, toHours: 48 },
    { key: '96_120', label: '96~120시간 전', fromHours: 120, toHours: 96 },
    { key: '120_144', label: '120~144시간 전', fromHours: 144, toHours: 120 },
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
    const location = useLocation();
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

    // ── 데이터 품질 ──────────────────────────────────────────────────────────
    const [healthSymbol, setHealthSymbol] = useState('BTCUSDT');
    const [healthMarket, setHealthMarket] = useState('FUTURES');
    const [healthHours,  setHealthHours]  = useState(1);
    const [healthData,   setHealthData]   = useState(null);
    const [healthLoading, setHealthLoading] = useState(false);
    const [healthError,   setHealthError]   = useState(null);
    const [healthRange,   setHealthRange]   = useState(null); // { fromMs, toMs } — 삭제 시 동일 범위 전달용
    const [correctionHealth, setCorrectionHealth] = useState(null);
    const [correctionResult, setCorrectionResult] = useState(null);
    const [correctionLoading, setCorrectionLoading] = useState(false);
    const [correctionError, setCorrectionError] = useState(null);
    chs.dlog(4, 'outlier 전용 symbol 상태 선언');
    const [outlierSymbol, setOutlierSymbol] = useState('BTCUSDT');
    chs.dlog(4, 'outlier 전용 market 상태 선언');
    const [outlierMarket, setOutlierMarket] = useState('FUTURES');
    const [outlierHealth, setOutlierHealth] = useState(null);
    const [outlierResult, setOutlierResult] = useState(null);
    const [outlierLoading, setOutlierLoading] = useState(false);
    const [outlierError, setOutlierError] = useState(null);
    const [outlierRangeKey, setOutlierRangeKey] = useState('current');
    const [outlierCustomFrom, setOutlierCustomFrom] = useState('');
    const [outlierCustomTo, setOutlierCustomTo] = useState('');

    const resetOutlierResults = () => {
        setOutlierHealth(null);
        setOutlierResult(null);
        setOutlierError(null);
    };

    // ── 내 IP ────────────────────────────────────────────────────────────────
    const [myIp, setMyIp] = useState(null);

    // ── 방문자 이력 ───────────────────────────────────────────────────────────
    const [visitorData,    setVisitorData]    = useState(null);
    const [visitorLoading, setVisitorLoading] = useState(false);
    const [visitorError,   setVisitorError]   = useState(null);

    // ── 허용 IP 관리 ─────────────────────────────────────────────────────────
    const [allowedIps, setAllowedIps] = useState([]);
    const [allowedLoading, setAllowedLoading] = useState(false);
    const [allowedError, setAllowedError] = useState(null);
    const [sampleOpen, setSampleOpen] = useState(false);

    const [deletingFlat, setDeletingFlat] = useState(null); // '1s'|'1m'|'5m'
    const [deleteMessage, setDeleteMessage] = useState(null);


    const handleDeleteFlat = async (tableKey) => {
        setDeletingFlat(tableKey);
        setDeleteMessage(null);
        try {
            const r = await apiClient.delete('/api/admin/backfill/flat', {
                params: {
                    symbol: healthSymbol,
                    marketType: healthMarket,
                    tableKey,
                    fromMs: healthRange?.fromMs,
                    toMs:   healthRange?.toMs,
                },
            });
            setDeleteMessage(r.data?.message ?? '완료');
            await handleHealthCheck();
        } catch (e) {
            setHealthError(e.response?.data?.error ?? `${tableKey} 초기화 실패`);
        } finally {
            setDeletingFlat(null);
        }
    };

    const handleHealthCheck = async () => {
        setHealthLoading(true);
        setHealthError(null);
        setHealthData(null);
        setDeleteMessage(null);
        try {
            const toMs   = Date.now();
            const fromMs = toMs - healthHours * 60 * 60 * 1000;
            setHealthRange({ fromMs, toMs });
            const r = await apiClient.get('/api/admin/backfill/health', {
                params: { symbol: healthSymbol, marketType: healthMarket, fromMs, toMs },
            });
            setHealthData(r.data);
        } catch (e) {
            setHealthError(e.response?.data?.error ?? '조회 실패');
        } finally {
            setHealthLoading(false);
        }
    };

    const handleFlatCorrectionHealth = async () => {
        chs.dlog(4, 'admin 보정 진단 시작');
        chs.dlog(4, 'healthSymbol healthMarket healthRange 값 확인');
        setCorrectionLoading(true);
        setCorrectionError(null);
        setCorrectionHealth(null);
        const toMs = healthRange?.toMs ?? Date.now();
        const fromMs = healthRange?.fromMs ?? toMs - healthHours * 60 * 60 * 1000;
        setHealthRange({ fromMs, toMs });
        chs.dlog(4, '보정 범위가 없으면 사용자가 from to 범위를 먼저 선택하도록 처리');
        try {
            chs.dlog(4, '/api/admin/backfill/flat-correction/health 호출');
            const r = await apiClient.get('/api/admin/backfill/flat-correction/health', {
                params: { symbol: healthSymbol, marketType: healthMarket, fromMs, toMs },
            });
            chs.dlog(4, 'raw 1s 1m 5m 상태를 화면 상태값에 저장');
            setCorrectionHealth(r.data);
            chs.dlog(4, '보정 가능 여부와 위험 메시지를 admin 카드에 표시');
        } catch (e) {
            setCorrectionError(e.response?.data?.error ?? '보정 진단 실패');
        } finally {
            setCorrectionLoading(false);
        }
    };

    const handleFlatCorrection = async () => {
        chs.dlog(4, 'admin 보정 실행 시작');
        chs.dlog(4, 'healthSymbol healthMarket healthRange 값 확인');
        setCorrectionLoading(true);
        setCorrectionError(null);
        setCorrectionResult(null);
        const toMs = healthRange?.toMs ?? Date.now();
        const fromMs = healthRange?.fromMs ?? toMs - healthHours * 60 * 60 * 1000;
        setHealthRange({ fromMs, toMs });
        chs.dlog(4, 'FUTURES 장애 구간인지 확인');
        try {
            chs.dlog(4, '/api/admin/backfill/flat-correction 호출');
            const r = await apiClient.post('/api/admin/backfill/flat-correction', {
                symbol: healthSymbol,
                marketType: healthMarket,
                fromMs,
                toMs,
            });
            chs.dlog(4, '1m kline 보정 결과를 화면 상태값에 저장');
            chs.dlog(4, '5m 재생성 결과를 화면 상태값에 저장');
            setCorrectionResult(r.data);
            setCorrectionHealth(r.data?.health ?? null);
            chs.dlog(4, '보정 후 health 조회를 다시 실행');
            await handleHealthCheck();
        } catch (e) {
            setCorrectionError(e.response?.data?.error ?? '보정 실패');
        } finally {
            setCorrectionLoading(false);
        }
    };

    const handleOutlierCorrectionHealth = async () => {
        chs.dlog(4, 'admin outlier 보정 진단 시작');
        chs.dlog(4, 'outlier 진단 시작 시 갭 조회 버튼 선택과 조회 결과 초기화');
        setActiveKey(null);
        setRows(null);
        chs.dlog(4, 'outlier 진단 시작 시 갭 조회 컬럼과 선택 row 초기화');
        setColumns([]);
        setSelectedRows(new Set());
        setError(null);
        chs.dlog(4, 'outlier 전용 시간 범위 확인');
        chs.dlog(4, 'outlier 직접 지정 범위가 선택되었는지 확인');
        chs.dlog(4, '직접 지정 from datetime-local 값을 Unix ms로 변환');
        chs.dlog(4, '직접 지정 to datetime-local 값을 Unix ms로 변환');
        chs.dlog(4, '직접 지정 범위가 비어있거나 역전된 경우 진단 요청 중단');
        let range;
        try {
            range = getOutlierRange();
        } catch (e) {
            setOutlierError(e.message);
            return;
        }
        setOutlierLoading(true);
        resetOutlierResults();
        const { fromMs, toMs } = range;
        chs.dlog(4, 'outlier 진단은 선택한 48시간 이하 구간만 사용');
        chs.dlog(4, 'outlier 진단 API에 outlier 전용 symbol market 전달');
        try {
            chs.dlog(4, '/api/admin/backfill/outlier-correction/health 호출');
            const r = await apiClient.get('/api/admin/backfill/outlier-correction/health', {
                params: { symbol: outlierSymbol, marketType: outlierMarket, fromMs, toMs },
            });
            chs.dlog(4, 'raw 기준 불일치 1m 후보를 화면 상태값에 저장');
            setOutlierHealth(r.data);
            chs.dlog(4, '영향받는 5m 목록과 보정 가능 여부를 admin 카드에 표시');
        } catch (e) {
            setOutlierError(e.response?.data?.error ?? 'outlier 진단 실패');
        } finally {
            setOutlierLoading(false);
        }
    };

    const handleOutlierCorrection = async () => {
        chs.dlog(4, 'admin outlier 보정 실행 시작');
        chs.dlog(4, 'outlier 보정 시작 시 갭 조회 버튼 선택과 조회 결과 초기화');
        setActiveKey(null);
        setRows(null);
        chs.dlog(4, 'outlier 보정 시작 시 갭 조회 컬럼과 선택 row 초기화');
        setColumns([]);
        setSelectedRows(new Set());
        setError(null);
        chs.dlog(4, 'outlier 전용 시간 범위 확인');
        chs.dlog(4, 'outlier 직접 지정 범위가 선택되었는지 확인');
        chs.dlog(4, '직접 지정 from datetime-local 값을 Unix ms로 변환');
        chs.dlog(4, '직접 지정 to datetime-local 값을 Unix ms로 변환');
        chs.dlog(4, '직접 지정 범위가 비어있거나 역전된 경우 보정 요청 중단');
        let range;
        try {
            range = getOutlierRange();
        } catch (e) {
            setOutlierError(e.message);
            return;
        }
        setOutlierLoading(true);
        setOutlierError(null);
        setOutlierResult(null);
        const { fromMs, toMs } = range;
        chs.dlog(4, 'FUTURES와 raw 존재 구간인지 확인');
        chs.dlog(4, 'outlier 보정 API에 outlier 전용 symbol market 전달');
        try {
            chs.dlog(4, '/api/admin/backfill/outlier-correction 호출');
            const r = await apiClient.post('/api/admin/backfill/outlier-correction', {
                symbol: outlierSymbol,
                marketType: outlierMarket,
                fromMs,
                toMs,
            });
            chs.dlog(4, 'raw 기준 1m 재생성 결과를 화면 상태값에 저장');
            chs.dlog(4, '영향 5m 재생성 결과를 화면 상태값에 저장');
            setOutlierResult(r.data);
            setOutlierHealth(r.data?.health ?? null);
            chs.dlog(4, 'outlier 보정 응답의 outlier health만 화면에 반영');
            chs.dlog(4, 'flat health와 갭 조회 결과는 outlier 보정 후 자동 재조회하지 않음');
        } catch (e) {
            setOutlierError(e.response?.data?.error ?? 'outlier 보정 실패');
        } finally {
            setOutlierLoading(false);
        }
    };

    const pollRef = useRef(null);

    const getOutlierRange = () => {
        chs.dlog(4, 'outlierRangeKey로 fromMs toMs 계산');
        chs.dlog(4, 'outlier 범위 옵션에 120~144시간 전 한단계 추가');
        chs.dlog(4, '직접 지정 옵션이면 outlierCustomFrom 값을 fromMs로 변환');
        chs.dlog(4, '직접 지정 옵션이면 outlierCustomTo 값을 toMs로 변환');
        chs.dlog(4, '직접 지정 옵션이면 변환된 fromMs toMs 반환');
        const option = OUTLIER_RANGE_OPTIONS.find((item) => item.key === outlierRangeKey)
            ?? OUTLIER_RANGE_OPTIONS[0];
        if (option.key === 'custom') {
            const fromMs = datetimeLocalToMs(outlierCustomFrom);
            const toMs = datetimeLocalToMs(outlierCustomTo);
            if (!fromMs || !toMs) {
                throw new Error('직접 지정 From/To를 입력해주세요.');
            }
            if (fromMs >= toMs) {
                throw new Error('직접 지정 From은 To보다 이전이어야 합니다.');
            }
            return { fromMs, toMs };
        }
        const now = Date.now();
        if (option.useHealthHours) {
            return {
                fromMs: now - healthHours * 60 * 60 * 1000,
                toMs: now,
            };
        }
        const fromMs = now - option.fromHours * 60 * 60 * 1000;
        const toMs = now - option.toHours * 60 * 60 * 1000;
        return { fromMs, toMs };
    };

    useEffect(() => {
        apiClient.get('/api/admin/data-gap/access')
            .then(r => setCanAccess(r.data.canAccess))
            .catch((e) => {
                if (e?.response?.status === 403) {
                    navigate('/admin/login', { replace: true, state: { from: location.pathname } });
                    return;
                }
                setCanAccess(false);
            });
    }, [navigate, location.pathname]);

    useEffect(() => {
        setFlagsLoading(true);
        apiClient.get('/api/admin/feature-flags')
            .then(r => setFlags(r.data))
            .catch(() => {})
            .finally(() => setFlagsLoading(false));
    }, []);

    const patchFlags = async (next) => {
        setFlags(next);
        try {
            const r = await apiClient.patch('/api/admin/feature-flags', next);
            setFlags(r.data);
        } catch {
            // ignore
        }
    };

    const loadVisitorLogs = async () => {
        setVisitorLoading(true);
        setVisitorError(null);
        try {
            const r = await apiClient.get('/api/admin/monitor/visitor-logs');
            setVisitorData(r.data);
        } catch (e) {
            setVisitorError(e.response?.data?.error ?? '조회 실패');
        } finally {
            setVisitorLoading(false);
        }
    };

    const loadAllowedIps = async () => {
        setAllowedLoading(true);
        setAllowedError(null);
        try {
            const r = await apiClient.get('/api/admin/monitor/allowed-ips');
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
            await apiClient.delete(`/api/admin/monitor/allowed-ips/${encodeURIComponent(ip)}`);
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
                apiClient.get('/api/admin/backfill/jobs').then(r => setJobs(r.data)).catch(() => {});
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

    useEffect(() => {
        apiClient.get('/api/admin/my-ip').then(r => setMyIp(r.data)).catch(() => {});
        loadVisitorLogs();
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
            const r = await apiClient.get('/api/admin/data-gap/check', { params });
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
                await apiClient.post('/api/admin/backfill/collect', body);
            }
            const jobs2 = await apiClient.get('/api/admin/backfill/jobs');
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
            const r = await apiClient.post('/api/admin/aggtrade/rollup', {
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
            await apiClient.post('/api/admin/backfill/collect', body);
            const jobs2 = await apiClient.get('/api/admin/backfill/jobs');
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
    const fmtDateTime = ms => ms != null ? new Date(Number(ms)).toLocaleString() : '—';

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
                                <div className={styles.title}>수동 검증</div>
                                <button
                                    type="button"
                                    className={`${styles.btn} ${styles.btnActive}`}
                                    onClick={() => navigate('/admin/test')}
                                >
                                    Admin Test 열기
                                </button>
                            </div>
                            <p className={styles.desc}>인증·디버그 등 운영자 전용 확인 UI (`/admin/test`).</p>
                        </div>

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
                            <div className={styles.inlineRow}>
                                <input className={styles.input} type="datetime-local" value={rFrom} onChange={e => setRFrom(e.target.value)} style={{ flex: 1 }} />
                                <input className={styles.input} type="datetime-local" value={rTo} onChange={e => setRTo(e.target.value)} style={{ flex: 1 }} />
                                <button
                                    type="button"
                                    className={`${styles.btn} ${styles.btnActive}`}
                                    onClick={handleRollup}
                                    disabled={rLoading || !rFrom || !rTo}
                                >
                                    {rLoading ? '실행 중...' : '롤업 실행'}
                                </button>
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

                        <div className={styles.card}>
                            <div className={styles.titleRow}>
                                <div className={styles.title}>방문 현황</div>
                                <button
                                    type="button"
                                    className={`${styles.btn} ${styles.btnActive}`}
                                    onClick={loadVisitorLogs}
                                    disabled={visitorLoading}
                                    style={{ marginLeft: 'auto' }}
                                >
                                    {visitorLoading ? '로딩 중...' : '새로고침'}
                                </button>
                            </div>
                            {visitorError && (
                                <div className={styles.muted} style={{ color: 'var(--monitor-severity-critical)' }}>{visitorError}</div>
                            )}
                            {visitorData && (
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '16px' }}>
                                    <div>
                                        <div className={styles.label} style={{ marginBottom: '8px' }}>경로별 집계</div>
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
                                        <div className={styles.label} style={{ marginBottom: '8px' }}>최근 방문 이력</div>
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
                                                        <tr><td colSpan={3} className={styles.muted} style={{ textAlign: 'center', padding: '12px' }}>데이터 없음</td></tr>
                                                    )}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </section>

                    <aside className={styles.sidebar}>
                        {myIp && (
                            <div className={styles.card} style={{ padding: '12px 14px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--monitor-gauge-ok)', boxShadow: '0 0 0 0 rgba(16,185,129,0.45)', display: 'inline-block', flexShrink: 0 }} />
                                    <span style={{ fontWeight: 900, fontSize: '13px', color: 'var(--monitor-text-primary)' }}>접속 정보</span>
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderTop: '1px dashed rgba(17,24,39,0.10)' }}>
                                        <span style={{ fontSize: '12px', fontWeight: 900, color: 'var(--monitor-text-secondary)' }}>IP</span>
                                        <span className={styles.mono} style={{ fontSize: '12px', fontWeight: 900, color: 'var(--monitor-gauge-ok)' }}>{myIp.ip}</span>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderTop: '1px dashed rgba(17,24,39,0.10)' }}>
                                        <span style={{ fontSize: '12px', fontWeight: 900, color: 'var(--monitor-text-secondary)' }}>remoteAddr</span>
                                        <span className={styles.mono} style={{ fontSize: '12px', color: 'var(--monitor-text-primary)' }}>{myIp.remoteAddr}</span>
                                    </div>
                                </div>
                            </div>
                        )}
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

                        <div className={styles.card}>
                            <div className={styles.titleRow}>
                                <div>
                                    <div className={styles.title}>UI 샘플</div>
                                    <div className={styles.subtitle}>공용 effect catalog</div>
                                </div>
                                <button
                                    type="button"
                                    className={`${styles.btn} ${styles.btnActive}`}
                                    onClick={() => setSampleOpen(true)}
                                    style={{ marginLeft: 'auto' }}
                                >
                                    샘플 보기
                                </button>
                            </div>
                            <div className={styles.desc}>
                                예: sample_live_spinner 를 특정 노드에 적용.
                            </div>
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
            {sampleOpen && (
                <div className={styles.sampleOverlay} onClick={() => setSampleOpen(false)}>
                    <div className={styles.sampleModal} onClick={(event) => event.stopPropagation()}>
                        <div className={styles.titleRow}>
                            <div>
                                <div className={styles.title}>UI 샘플 카탈로그</div>
                                <div className={styles.subtitle}>class name으로 다른 페이지에서 재사용</div>
                            </div>
                            <button
                                type="button"
                                className={styles.btn}
                                onClick={() => setSampleOpen(false)}
                            >
                                닫기
                            </button>
                        </div>
                        <div className={styles.sampleGrid}>
                            {VISUAL_EFFECT_SAMPLES.map(sample => (
                                <div key={sample.key} className={styles.sampleCard}>
                                    <div className={styles.samplePreview}>
                                        <span className={`${styles.sampleGlyph} ${sample.className}`} aria-hidden="true" />
                                    </div>
                                    <div className={styles.sampleMeta}>
                                        <div className={styles.sampleKey}>{sample.key}</div>
                                        <div className={styles.sampleLabel}>{sample.label}</div>
                                        <div className={styles.desc}>{sample.intent}</div>
                                        <code className={styles.sampleCode}>{sample.example}</code>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </Layout>
    );
}
