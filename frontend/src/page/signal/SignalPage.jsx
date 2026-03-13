// [AGENT] Signal Dashboard — 메인 페이지 (Grid 레이아웃 + 상태 관리)
// [AGENT] 모바일/데스크톱 레이아웃 분리: isMobile 기준으로 return 분기
import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import Layout from '../../shared/ui/layout/Layout.jsx';
import { useSignalSse } from '../../domain/binance/model/hook/useSignalSse.ts';
import TopBar from './TopBar.jsx';
import LongPanel from './LongPanel.jsx';
import ShortPanel from './ShortPanel.jsx';
import ShortLiqPanel from './ShortLiqPanel.jsx';
import LiquidationPanel from './LiquidationPanel.jsx';
import MainCore from './MainCore.jsx';
import PatternStrip from './PatternStrip.jsx';
import EnergyGauge from './EnergyGauge.jsx';
import TugOfWar from './TugOfWar.jsx';

const DATA_RANGE_MAP = { '1m': '10m', '5m': '50m', '30m': '5h', '1h': '10h', '4h': '40h' };
const getDataRange = (range) => DATA_RANGE_MAP[range] ?? range;

export default function SignalPage() {
    const [symbol, setSymbol] = useState('BTCUSDT');
    const [timeRange, setTimeRange] = useState(() => localStorage.getItem('signal_timeRange') || '1m');
    const [initData, setInitData] = useState(null);
    const [historyData, setHistoryData] = useState(null);
    const [isDesktopView, setIsDesktopView] = useState(false);
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

    const abortControllerRef = useRef(null);
    const symbolDebounceRef = useRef(null);

    const { aggTrades, forceOrders, latestOi, connected } = useSignalSse({ symbol });

    useEffect(() => {
        const loadInit = async () => {
            try {
                const res = await axios.get(`/api/signal/init?symbol=${symbol}`);
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
                const res = await axios.get(`/api/signal/history?symbol=${symbol}&range=${getDataRange(timeRange)}`, {
                    signal: abortControllerRef.current.signal,
                });
                setHistoryData(res.data);

                if (res.data.longEnergy !== undefined) setLongEnergy(res.data.longEnergy);
                if (res.data.shortEnergy !== undefined) setShortEnergy(res.data.shortEnergy);
                if (res.data.longLiqTotal !== undefined) setLongLiqTotal(res.data.longLiqTotal);
                if (res.data.shortLiqTotal !== undefined) setShortLiqTotal(res.data.shortLiqTotal);
                if (res.data.longLiqEvents) setLongLiqEvents(res.data.longLiqEvents);
                if (res.data.shortLiqEvents) setShortLiqEvents(res.data.shortLiqEvents);
                if (res.data.oiHistory) setOiDataHistory(res.data.oiHistory);
            } catch (err) {
                if (err.name !== 'CanceledError') {
                    console.error('[SignalPage] history failed', err);
                }
            }
        };
        loadHistory();
    }, [symbol, timeRange]);

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
            const updated = [...prev, latestOi].slice(-100); // 최근 100개 유지
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
            handleTimeRangeChange('1m');
        }, 300);
    };

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
                    onTimeRangeChange={setTimeRange}
                    fundingRate={commonProps.fundingRate}
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
                    longEnergy={longEnergy}
                    shortEnergy={shortEnergy}
                    fundingRate={commonProps.fundingRate}
                    oiData={oiDataHistory}
                />
            </div>

            <div style={{ gridColumn: '10 / 13', gridRow: '2', overflow: 'hidden' }}>
                <ShortPanel energy={shortEnergy} trades={shortTrades} side="SHORT" />
            </div>

            <div style={{ gridColumn: '10 / 13', gridRow: '3', overflow: 'hidden' }}>
                <LiquidationPanel total={longLiqTotal} events={longLiqEvents} />
            </div>

            <div style={{ gridColumn: '1 / 13', gridRow: '4' }}>
                <PatternStrip patterns={patterns} />
            </div>
            </div>
        </Layout>
    );
}
