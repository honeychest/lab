// [AGENT] Signal Dashboard — 메인 페이지 (Grid 레이아웃 + 상태 관리)
// [AGENT] 모바일/데스크톱 레이아웃 분리: isMobile 기준으로 return 분기
// [AGENT] TASK-12: latestCandleTime, divergenceData, params/canEdit 상태 추가 + 컴포넌트 Props 스캐폴딩
// [AGENT] T4-STEALTH: PatternStrip Props 변경 — symbol만 전달 (latestCandleTime, params 제거)
import { useState, useEffect, useRef } from 'react';
import Layout from '../../shared/ui/layout/Layout.jsx';
import { useSignalSse } from '../../domain/binance/model/hook/useSignalSse.ts';
import TopBar from './TopBar.jsx';
import LongPanel from './components/LongPanel.jsx';
import ShortPanel from './components/ShortPanel.jsx';
import ShortLiqPanel from './components/ShortLiqPanel.jsx';
import LiquidationPanel from './components/LiquidationPanel.jsx';
import MainCore from './components/MainCore.jsx';
import PatternStrip from './components/PatternStrip.jsx';
import apiClient from '@/api/apiClient.js';
import EnergyGauge from './components/EnergyGauge.jsx';
import TugOfWar from './components/TugOfWar.jsx';

// value: 타임라인 식별자 | dataRange: 에너지·청산·OI 조회 범위 | candleType: 캔들 테이블(1m/5m) | displayCount: 차트 표시 봉 수
// 이곳의 index 2개가 1m 5m 의 limit count를 결정한다
// TIME_RANGES[2].displayCount → 1m 캔들 서버 조회 limit
// TIME_RANGES[TIME_RANGES.length-1].displayCount → 5m 캔들 서버 조회 limit
const TIME_RANGES = [
    { value: '1m',  label: '1분',   dataRange: '1m',  candleType: '1m', displayCount: 30  },
    { value: '5m',  label: '5분',   dataRange: '5m',  candleType: '1m', displayCount: 60  },
    { value: '30m', label: '30분',  dataRange: '30m', candleType: '1m', displayCount: 90  },
    { value: '4h',  label: '4시간', dataRange: '4h',  candleType: '5m', displayCount: 432 },
    { value: '48h',  label: '48시간',  dataRange: '48h',  candleType: '5m', displayCount: 1728 },
    { value: '168h', label: '168시간', dataRange: '168h', candleType: '5m', displayCount: 6048 },
    { value: '336h', label: '336시간', dataRange: '336h', candleType: '5m', displayCount: 12096 },
];
const LIMIT_1M = TIME_RANGES[2].displayCount;
const LIMIT_5M = TIME_RANGES[TIME_RANGES.length - 1].displayCount;

// OI 차트와 동일한 캔들 타입 — 비교 기준 통일 (변경 시 여기만 수정)
const CHART_CANDLE_TYPE = '5m';

const getDataRange    = (range) => TIME_RANGES.find((r) => r.value === range)?.dataRange    ?? '5m';

const getDisplayCount = (range) => TIME_RANGES.find((r) => r.value === range)?.displayCount ?? 90;

export default function SignalPage() {
    const [symbol, setSymbol] = useState('BTCUSDT');
    const [timeRange, setTimeRange] = useState(() => localStorage.getItem('signal_timeRange') || TIME_RANGES[Math.floor(TIME_RANGES.length / 2)].value);
    const [initData, setInitData] = useState(null);
    const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);

    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth < 768);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    const [longEnergy, setLongEnergy] = useState(0);
    const [shortEnergy, setShortEnergy] = useState(0);
    const [longTrades, setLongTrades] = useState([]);
    const [shortTrades, setShortTrades] = useState([]);
    const [longLiqEvents, setLongLiqEvents] = useState([]);
    const [shortLiqEvents, setShortLiqEvents] = useState([]);
    const [longLiqTotal, setLongLiqTotal] = useState(0);
    const [shortLiqTotal, setShortLiqTotal] = useState(0);
    const [patterns, setPatterns] = useState([]);
    const [oiDataHistory, setOiDataHistory] = useState([]);
    const [candleHistory, setCandleHistory] = useState([]);
    const [, setLatestCandleTime] = useState(null);
    const [params, setParams] = useState(null);
    const [canEdit, setCanEdit] = useState(false);
    const [templates, setTemplates] = useState([]);
    const [selectedTemplateId, setSelectedTemplateId] = useState(() => {
        const stored = localStorage.getItem('signal_template_id');
        return stored ? Number(stored) : null;
    });

    const abortControllerRef = useRef(null);
    const symbolDebounceRef = useRef(null);

    const { aggTrades, forceOrders, latestOi } = useSignalSse({ symbol });

    useEffect(() => {
        const loadInit = async () => {
            try {
                const res = await apiClient.get(`/api/signal/init?symbol=${symbol}`);
                setInitData(res.data);
            } catch (err) {
                console.error('[SignalPage] init failed', err);
            }
        };
        loadInit();
    }, [symbol]);

    useEffect(() => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }
        abortControllerRef.current = new AbortController();

        const loadHistory = async () => {
            try {
                const res = await apiClient.get(`/api/signal/history?symbol=${symbol}&range=${getDataRange(timeRange)}`, {
                    signal: abortControllerRef.current.signal,
                });
                if (res.data.longEnergy !== undefined) setLongEnergy(res.data.longEnergy);
                if (res.data.shortEnergy !== undefined) setShortEnergy(res.data.shortEnergy);
                if (res.data.longLiqTotal !== undefined) setLongLiqTotal(res.data.longLiqTotal);
                if (res.data.shortLiqTotal !== undefined) setShortLiqTotal(res.data.shortLiqTotal);
                if (res.data.longLiqEvents) setLongLiqEvents(res.data.longLiqEvents);
                if (res.data.shortLiqEvents) setShortLiqEvents(res.data.shortLiqEvents);
            } catch (err) {
                if (err.name !== 'CanceledError') {
                    console.error('[SignalPage] history failed', err);
                }
            }
        };
        loadHistory();
    }, [symbol, timeRange]);

    // OI 히스토리: timeRange 이상 데이터 로드 (최소 120h 보장) → 클라이언트에서 rangeMs 기준 슬라이싱
    const LARGE_OI_RANGES = new Set(['168h', '336h']);
    useEffect(() => {
        const loadOiHistory = async () => {
            try {
                const oiRange = LARGE_OI_RANGES.has(timeRange) ? timeRange : '120h';
                const res = await apiClient.get(`/api/signal/oi?symbol=${symbol}&range=${oiRange}`);
                if (Array.isArray(res.data)) setOiDataHistory(res.data);
            } catch (err) {
                console.error('[SignalPage] OI history failed', err);
            }
        };
        loadOiHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [symbol, timeRange]);

    useEffect(() => {
        const loadParams = async () => {
            try {
                const res = await apiClient.get(`/api/signal/params?symbol=${symbol}`);
                const { canEdit: ce, ...rest } = res.data;
                setParams(rest);
                setCanEdit(!!ce);
            } catch (err) {
                console.error('[SignalPage] params failed', err);
            }
        };
        loadParams();
    }, [symbol]);

    useEffect(() => {
        const loadTemplates = async () => {
            try {
                const res = await apiClient.get('/api/analysis/templates');
                const list = Array.isArray(res.data) ? res.data : [];
                setTemplates(list);
                if (list.length === 0) {
                    return;
                }
                // 현재 선택된 템플릿이 없거나 목록에 없으면 첫 번째 템플릿으로 기본 설정
                const exists = list.some((t) => t.id === selectedTemplateId);
                if (selectedTemplateId == null || !exists) {
                    const firstId = list[0].id;
                    setSelectedTemplateId(firstId);
                    localStorage.setItem('signal_template_id', String(firstId));
                }
            } catch (err) {
                console.error('[SignalPage] templates failed', err);
            }
        };
        loadTemplates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        if (selectedTemplateId != null) {
            localStorage.setItem('signal_template_id', String(selectedTemplateId));
        } else {
            localStorage.removeItem('signal_template_id');
        }
    }, [selectedTemplateId]);

    // 캔들 히스토리: CHART_CANDLE_TYPE 고정(OI와 동일 기준) — symbol·displayCount 변경 시 재로드
    const candleType  = CHART_CANDLE_TYPE;
    const candleLimit = getDisplayCount(timeRange);
    useEffect(() => {
        setCandleHistory([]);
        apiClient.get(`/api/signal/candles?symbol=${symbol}&type=${candleType}&limit=${candleLimit}`)
            .then((res) => setCandleHistory(res.data))
            .catch((err) => console.error('[SignalPage] candles failed', err));
    }, [symbol, candleType, candleLimit]);

    const handleCandleUpdate = (bar) => {
        setCandleHistory((prev) => [...prev, bar]);
    };

    const handleParamsSave = async (newParams) => {
        const res = await apiClient.put(`/api/signal/params?symbol=${symbol}`, newParams);
        const { canEdit: _ce, ...rest } = res.data;
        setParams(rest);
        // params 참조 변경 → PatternStrip useEffect 재실행 (자동 재계산 트리거)
    };

    useEffect(() => {
        if (aggTrades.length === 0) return;

        const latest = aggTrades[0];
        
        if (latest.symbol !== symbol) return;

        const qty = parseFloat(latest.quantity);
        const price = parseFloat(latest.price);
        const value = qty * price;

        if (latest.isBuyerMaker) {
            setShortEnergy((prev) => prev + value);
            setShortTrades((prev) => [...prev, latest].slice(-20));
        } else {
            setLongEnergy((prev) => prev + value);
            setLongTrades((prev) => [...prev, latest].slice(-20));
        }

    }, [aggTrades, symbol]);

    useEffect(() => {
        if (forceOrders.length === 0) return;

        const latest = forceOrders[0];

        if (latest.symbol !== symbol) return;

        const qty = parseFloat(latest.quantity);
        const price = parseFloat(latest.price);
        const value = qty * price;

        if (latest.side === 'SELL') {
            setLongEnergy((prev) => Math.max(0, prev - value));
            setLongLiqTotal((prev) => prev + value);
            setLongLiqEvents((prev) => [latest, ...prev].slice(0, 50));
        } else {
            setShortEnergy((prev) => Math.max(0, prev - value));
            setShortLiqTotal((prev) => prev + value);
            setShortLiqEvents((prev) => [latest, ...prev].slice(0, 50));
        }
    }, [forceOrders, symbol]);

    // OI 데이터 수신 처리
    useEffect(() => {
        if (!latestOi) return;

        if (latestOi.symbol !== symbol) return;

        setOiDataHistory((prev) => {
            const updated = [...prev, latestOi].slice(-5000); // 최근 5000개 유지 (5분봉 ~17일)
            return updated;
        });
    }, [latestOi, symbol]);

    const handleTimeRangeChange = (range) => {
        localStorage.setItem('signal_timeRange', range);
        setTimeRange(range);
    };

    const handleSymbolChange = (newSymbol) => {
        if (symbolDebounceRef.current) clearTimeout(symbolDebounceRef.current);
        symbolDebounceRef.current = setTimeout(() => {
            setSymbol(newSymbol);
            setLongEnergy(0);
            setShortEnergy(0);
            setLongTrades([]);
            setShortTrades([]);
            setLongLiqEvents([]);
            setShortLiqEvents([]);
            setLongLiqTotal(0);
            setShortLiqTotal(0);
            setPatterns([]);
            setOiDataHistory([]);
            setCandleHistory([]);
            setLatestCandleTime(null);
        }, 300);
    };

    const displayCount  = getDisplayCount(timeRange);
    const candleUnitMs  = candleType === '1m' ? 60_000 : 300_000;
    const rangeMs       = displayCount * candleUnitMs;

    const commonProps = {
        symbol,
        fundingRate: initData?.latestFundingRate || null,
        longEnergy, shortEnergy,
        longTrades, shortTrades,
        longLiqEvents, shortLiqEvents,
        longLiqTotal, shortLiqTotal,
        oiDataHistory, patterns,
    };

    if (isMobile) {
        return (
            <Layout footerCenter={['SSE', 'ECharts', 'React 19', 'Tailwind CSS']}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', padding: '4px', backgroundColor: '#06060c', fontFamily: "'Pretendard', sans-serif", height: '100%', overflow: 'hidden' }}>
                    <TopBar
                        symbol={symbol}
                        onSymbolChange={handleSymbolChange}
                        timeRange={timeRange}
                        onTimeRangeChange={handleTimeRangeChange}
                        fundingRate={commonProps.fundingRate}
                        timeRanges={TIME_RANGES}
                        compact
                    />
                    <div style={{ backgroundColor: '#0e0f18', borderRadius: '10px', padding: '10px', position: 'relative', height: '200px', flexShrink: 0 }}>
                        <EnergyGauge longEnergy={longEnergy} shortEnergy={shortEnergy} compact />
                        <TugOfWar longEnergy={longEnergy} shortEnergy={shortEnergy} />
                        <div style={{ position: 'absolute', bottom: '20px', left: '30px', fontSize: '10px', color: 'rgba(0,232,135,0.35)' }}>LONG</div>
                        <div style={{ position: 'absolute', bottom: '20px', right: '30px', fontSize: '10px', color: 'rgba(255,59,92,0.35)' }}>SHORT</div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px', flex: 1, minHeight: 0 }}>
                        <LongPanel energy={longEnergy} trades={longTrades} side="LONG" compact />
                        <ShortPanel energy={shortEnergy} trades={shortTrades} side="SHORT" compact />
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px', flex: 1, minHeight: 0 }}>
                        <ShortLiqPanel total={shortLiqTotal} events={shortLiqEvents} />
                        <LiquidationPanel total={longLiqTotal} events={longLiqEvents} />
                    </div>
                </div>
            </Layout>
        );
    }

    return (
        <Layout footerCenter={['SSE', 'ECharts', 'Lightweight Charts', 'React 19', 'Tailwind CSS']}>
            <div
                style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(12, 1fr)',
                    gridTemplateRows: '44px 1fr 0.6fr 440px',
                    gap: '4px',
                    padding: '4px',
                    height: '100%',
                    backgroundColor: '#06060c',
                    fontFamily: "'Pretendard', sans-serif",
                }}
            >
            <div style={{ gridColumn: '1 / 13', gridRow: '1' }}>
                <TopBar
                    symbol={symbol}
                    onSymbolChange={handleSymbolChange}
                    timeRange={timeRange}
                    onTimeRangeChange={handleTimeRangeChange}
                    fundingRate={commonProps.fundingRate}
                    timeRanges={TIME_RANGES}
                    canEdit={canEdit}
                    params={params}
                    onParamsSave={handleParamsSave}
                    templates={templates}
                    selectedTemplateId={selectedTemplateId}
                    onTemplateChange={setSelectedTemplateId}
                />
            </div>

            <div style={{ gridColumn: '1 / 4', gridRow: '2', overflow: 'hidden' }}>
                <LongPanel energy={longEnergy} trades={longTrades} side="LONG" />
            </div>

            <div style={{ gridColumn: '1 / 4', gridRow: '3', overflow: 'hidden' }}>
                <ShortLiqPanel total={shortLiqTotal} events={shortLiqEvents} />
            </div>

            <div style={{ gridColumn: '4 / 10', gridRow: '2 / 4' }}>
                <MainCore
                    symbol={symbol}
                    longEnergy={longEnergy}
                    shortEnergy={shortEnergy}
                    fundingRate={commonProps.fundingRate}
                    oiData={oiDataHistory}
                    candleHistory={candleHistory}
                    candleType={candleType}
                    timeRange={timeRange}
                    displayCount={displayCount}
                    rangeMs={rangeMs}
                    onCandleTime={setLatestCandleTime}
                    onCandleUpdate={handleCandleUpdate}
                />
            </div>

            <div style={{ gridColumn: '10 / 13', gridRow: '2', overflow: 'hidden' }}>
                <ShortPanel energy={shortEnergy} trades={shortTrades} side="SHORT" />
            </div>

            <div style={{ gridColumn: '10 / 13', gridRow: '3', overflow: 'hidden' }}>
                <LiquidationPanel total={longLiqTotal} events={longLiqEvents} />
            </div>

            <div style={{ gridColumn: '1 / 13', gridRow: '4' }}>
            <PatternStrip
                symbol={symbol}
                templateId={selectedTemplateId}
                templateName={templates.find((t) => t.id === selectedTemplateId)?.name}
                paletteLevel={templates.find((t) => t.id === selectedTemplateId)?.palette ?? 'MID'}
                templates={templates}
                onTemplateChange={setSelectedTemplateId}
            />
            </div>
            </div>
        </Layout>
    );
}
