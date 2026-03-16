// [AGENT] TASK-09: 5분봉 캔들 차트 — Lightweight Charts v5 CandlestickSeries
// TASK-FIX: candleHistory prop 수신(초기 렌더) + WS로 실시간 append (candleType prop으로 엔드포인트 결정)
// is_closed:true → onCandleUpdate 콜백(SignalPage candleHistory 업데이트)
import { createChart, CandlestickSeries } from 'lightweight-charts';
import { useEffect, useRef, useState } from 'react';

const WS_PROTOCOL = window.location.protocol === 'https:' ? 'wss:' : 'ws:';

export default function CandleChart({ symbol, candleHistory = [], candleType = '5m', onCandleTime, onCandleUpdate }) {
    const containerRef        = useRef(null);
    const chartRef            = useRef(null);
    const seriesRef           = useRef(null);
    const isInitRef           = useRef(false);
    const wsRef               = useRef(null);
    const reconnectTimer      = useRef(null);
    const onCandleTimeRef     = useRef(onCandleTime);
    const onCandleUpdateRef   = useRef(onCandleUpdate);
    const formingBarRef       = useRef(null);
    const [connecting, setConnecting] = useState(true);
    const [tooltip, setTooltip] = useState(null); // { x, y, time, close, delta }
    const candleHistoryRef = useRef(candleHistory);

    // 콜백 ref 동기화 — WS effect를 재실행하지 않고 최신 함수 유지
    useEffect(() => { onCandleTimeRef.current   = onCandleTime;   });
    useEffect(() => { onCandleUpdateRef.current = onCandleUpdate; });
    useEffect(() => { candleHistoryRef.current  = candleHistory;  });

    // 차트 초기화 (한 번만)
    useEffect(() => {
        if (!containerRef.current || isInitRef.current) return;

        const chart = createChart(containerRef.current, {
            autoSize: true,
            handleScale: false,
            handleScroll: false,
            layout: {
                background: { color: '#0e0f18' },
                textColor: 'rgba(255,255,255,0.3)',
                attributionLogo: false,
            },
            grid: {
                vertLines: { color: 'rgba(255,255,255,0.03)' },
                horzLines: { color: 'rgba(255,255,255,0.03)' },
            },
            timeScale: { visible: false },
            rightPriceScale: { visible: false },
            crosshair: {
                horzLine: { labelVisible: false },
                vertLine: { labelVisible: false },
            },
        });

        const series = chart.addSeries(CandlestickSeries, {
            upColor:   'rgba(80,160,255,0.9)',
            downColor: 'rgba(255,160,50,0.9)',
            borderUpColor:   'rgba(80,160,255,0.9)',
            borderDownColor: 'rgba(255,160,50,0.9)',
            wickUpColor:   'rgba(80,160,255,0.6)',
            wickDownColor: 'rgba(255,160,50,0.6)',
        });

        chart.subscribeCrosshairMove((param) => {
            if (!param.point || !param.time || !containerRef.current) {
                setTooltip(null);
                return;
            }
            const data = param.seriesData?.get(series);
            if (!data) { setTooltip(null); return; }

            const timeMs = param.time * 1000;
            const candle = candleHistoryRef.current.find((c) => c.time === timeMs);
            const delta  = candle?.delta ?? null;

            setTooltip({
                x:          param.point.x,
                y:          param.point.y,
                time:       param.time,
                close:      data.close,
                delta,
                containerW: containerRef.current?.clientWidth ?? 0,
            });
        });

        chartRef.current  = chart;
        seriesRef.current = series;
        isInitRef.current = true;

        return () => {
            chart.remove();
            chartRef.current  = null;
            seriesRef.current = null;
            isInitRef.current = false;
        };
    }, []);

    // candleHistory 변경 시 차트 데이터 갱신 — 초기 로드 시점 고정, 우측으로 누적 (OI 차트와 동일)
    useEffect(() => {
        if (!seriesRef.current || candleHistory.length === 0) return;
        const bars = candleHistory
            .map((c) => ({
                time:  Math.floor(c.time / 1000),
                open:  c.open,
                high:  c.high,
                low:   c.low,
                close: c.close,
            }))
            .sort((a, b) => a.time - b.time)
            .filter((item, idx, arr) => idx === 0 || item.time !== arr[idx - 1].time);
        const first = bars[0];
        const last  = bars[bars.length - 1];
        console.log('[CandleChart] setData', bars.length, '봉',
            '| 첫봉:', first ? new Date(first.time * 1000).toLocaleString() : '-',
            '| 마지막봉:', last ? new Date(last.time * 1000).toLocaleString() : '-');
        seriesRef.current.setData(bars);
        if (formingBarRef.current) {
            console.log('[CandleChart] formingBar 재적용:', new Date(formingBarRef.current.time * 1000).toLocaleString());
            seriesRef.current.update(formingBarRef.current);
        }
        chartRef.current?.timeScale().fitContent();
        setConnecting(false); // eslint-disable-line react-hooks/set-state-in-effect
    }, [candleHistory]);

    // symbol·interval 변경 시만 WS 재연결 — candleType(CHART_CANDLE_TYPE)으로 결정
    const interval = candleType;

    useEffect(() => {
        if (!symbol) return;

        clearTimeout(reconnectTimer.current);
        if (wsRef.current) {
            wsRef.current.onclose = null;
            wsRef.current.onerror = null;
            wsRef.current.close();
            wsRef.current = null;
        }
        let destroyed  = false;

        const connect = () => {
            if (destroyed) return;
            const url = `${WS_PROTOCOL}//${window.location.host}/ws/candle/${interval}?symbol=${symbol}`;
            const ws  = new WebSocket(url);
            wsRef.current = ws;

            ws.onopen = () => {
                if (!destroyed) setConnecting(false);
            };

            ws.onmessage = (e) => {
                if (destroyed) return;
                setConnecting(false);
                try {
                    const msg     = JSON.parse(e.data);
                    const unixSec = Math.floor(new Date(msg.time).getTime() / 1000);
                    if (isNaN(unixSec)) return;

                    const bar = { time: unixSec, open: msg.open, high: msg.high, low: msg.low, close: msg.close };
                    if (seriesRef.current) seriesRef.current.update(bar);

                    if (!msg.is_closed) {
                        const prevTime = formingBarRef.current?.time;
                        if (prevTime !== bar.time) {
                            console.log('[CandleChart] forming 새봉 시작:', new Date(bar.time * 1000).toLocaleString());
                        }
                        formingBarRef.current = bar;
                    } else {
                        console.log('[CandleChart] is_closed 수신 (5m 완성):', new Date(bar.time * 1000).toLocaleString(), '| candleHistory 현재 길이:', candleHistoryRef.current.length);
                        if (onCandleTimeRef.current) onCandleTimeRef.current(new Date(msg.time).getTime());
                        if (onCandleUpdateRef.current) {
                            onCandleUpdateRef.current({
                                time:  new Date(msg.time).getTime(),
                                open:  msg.open,
                                high:  msg.high,
                                low:   msg.low,
                                close: msg.close,
                                delta: msg.delta ?? 0,
                            });
                        }
                    }
                } catch {
                    // 파싱 실패 무시
                }
            };

            ws.onclose = () => {
                if (destroyed) return;
                reconnectTimer.current = setTimeout(connect, 5000);
            };

            ws.onerror = () => { ws.close(); };
        };

        connect();

        return () => {
            destroyed = true;
            clearTimeout(reconnectTimer.current);
            if (wsRef.current) {
                wsRef.current.onclose = null;
                wsRef.current.onerror = null;
                wsRef.current.close();
                wsRef.current = null;
            }
        };
    }, [symbol, interval]);

    const tooltipEl = tooltip && (() => {
        const date    = new Date(tooltip.time * 1000);
        const timeStr = `${date.getMonth() + 1}/${date.getDate()} ${date.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })}`;
        const closeStr = '$' + Number(tooltip.close).toLocaleString(undefined, { maximumFractionDigits: 0 });
        const deltaColor  = tooltip.delta >= 0 ? 'rgba(80,160,255,0.9)' : 'rgba(255,160,50,0.9)';
        const deltaLabel  = tooltip.delta >= 0 ? '순매수' : '순매도';
        const deltaStr    = tooltip.delta != null
            ? `${deltaLabel} ${tooltip.delta >= 0 ? '+' : ''}${Number(tooltip.delta).toLocaleString(undefined, { maximumFractionDigits: 2 })} BTC`
            : null;

        const containerW = tooltip.containerW ?? 0;
        const left = tooltip.x + 12 + 120 > containerW ? tooltip.x - 132 : tooltip.x + 12;

        return (
            <div style={{
                position: 'absolute',
                left,
                top: Math.max(4, tooltip.y - 36),
                background: 'rgba(14,15,24,0.92)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '6px',
                padding: '5px 8px',
                pointerEvents: 'none',
                fontFamily: "'Pretendard', sans-serif",
                fontSize: '11px',
                lineHeight: '1.6',
                whiteSpace: 'nowrap',
                zIndex: 10,
            }}>
                <div style={{ color: 'rgba(255,255,255,0.45)' }}>{timeStr}</div>
                <div style={{ color: 'rgba(255,255,255,0.85)', fontWeight: 600 }}>{closeStr}</div>
                {deltaStr && <div style={{ color: deltaColor, fontWeight: 600 }}>{deltaStr}</div>}
            </div>
        );
    })();

    return (
        <div style={{ position: 'relative', width: '100%', height: '100%' }}>
            <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
            {tooltipEl}
            {connecting && (
                <div style={{
                    position: 'absolute', inset: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '11px', color: 'rgba(255,255,255,0.3)',
                    fontFamily: "'Pretendard', sans-serif",
                    pointerEvents: 'none',
                }}>
                    연결 중...
                </div>
            )}
        </div>
    );
}
