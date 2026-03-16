// [AGENT] OI 라인 차트 — Lightweight Charts (증감 반영)
// rangeMs 기준 클라이언트 슬라이싱: TIME_RANGES displayCount × candleUnit ms
import { createChart, AreaSeries } from 'lightweight-charts';
import { useEffect, useRef } from 'react';

export default function OiLineChart({ oiData = [], rangeMs }) {
    const containerRef = useRef(null);
    const chartRef = useRef(null);
    const seriesRef = useRef(null);
    const tooltipRef = useRef(null);
    const lastPriceLabelRef = useRef(null);
    const isInitializedRef = useRef(false);
    const priceMapRef = useRef({});
    const initialNowRef = useRef(null);
    const prevRangeMsRef = useRef(rangeMs);

    useEffect(() => {
        if (!containerRef.current) return;

        // 첫 초기화만 수행
        if (!isInitializedRef.current) {
            try {
                console.log('[OiLineChart] 차트 초기화 시작');

                // 차트 생성
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
                    timeScale: {
                        visible: false,
                    },
                    rightPriceScale: {
                        visible: false,
                    },
                    crosshair: {
                        horzLine: { labelVisible: false },
                        vertLine: { labelVisible: false },
                    },
                });

                chartRef.current = chart;
                isInitializedRef.current = true;

                // 면적 시리즈 생성 (v5 API)
                const lineSeries = chart.addSeries(AreaSeries, {
                    lineColor: '#00e887',
                    topColor: 'rgba(0,232,135,0.4)',
                    bottomColor: 'rgba(0,232,135,0.0)',
                    lineWidth: 2,
                });

                seriesRef.current = lineSeries;

                // 커스텀 툴팁 구독
                chart.subscribeCrosshairMove((param) => {
                    const tooltip = tooltipRef.current;
                    if (!tooltip) return;

                    if (!param.time || !param.point || param.point.x < 0 || param.point.y < 0) {
                        tooltip.style.display = 'none';
                        return;
                    }

                    const value = param.seriesData.get(lineSeries)?.value;
                    if (value === undefined) {
                        tooltip.style.display = 'none';
                        return;
                    }

                    const date = new Date(param.time * 1000);
                    const timeStr = date.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false });
                    const dateStr = `${date.getMonth() + 1}/${date.getDate()} ${timeStr}`;
                    const price = priceMapRef.current[param.time];
                    const priceHtml = price != null
                        ? `<div style="color:rgba(255,255,255,0.5);font-size:10px;margin-top:2px">$${price.toLocaleString()}</div>`
                        : '';

                    tooltip.innerHTML = `<div style="color:rgba(255,255,255,0.5);font-size:10px;margin-bottom:2px">${dateStr}</div><div style="font-size:12px;font-weight:600">${value.toLocaleString()}</div>${priceHtml}`;

                    const containerWidth = containerRef.current.clientWidth;
                    const tooltipWidth = 110;
                    let left = param.point.x + 12;
                    if (left + tooltipWidth > containerWidth) left = param.point.x - tooltipWidth - 8;

                    tooltip.style.left = `${left}px`;
                    tooltip.style.top = `${Math.max(0, param.point.y - 28)}px`;
                    tooltip.style.display = 'block';
                });

                console.log('[OiLineChart] 차트 초기화 완료');
            } catch (err) {
                console.error('[OiLineChart] 초기화 에러:', err);
                isInitializedRef.current = false;
                return;
            }
        }

        // 데이터 업데이트 (초기화 후) — 첫 수신 시점 고정, rangeMs 변경 시 리셋
        if (prevRangeMsRef.current !== rangeMs) {
            prevRangeMsRef.current = rangeMs;
            initialNowRef.current  = null;
        }
        if (!initialNowRef.current && oiData.length > 0) {
            initialNowRef.current = Date.now();
            console.log('[OiLineChart] initialNow 캡처:', new Date(initialNowRef.current).toLocaleString(), '| rangeMs:', rangeMs);
        }
        const sliced = oiData.filter((item) => initialNowRef.current
            ? item.collectedAtMs >= initialNowRef.current - rangeMs
            : false
        );
        if (sliced.length > 0) {
            const first = sliced[0];
            const last  = sliced[sliced.length - 1];
            console.log('[OiLineChart] 필터 후', sliced.length, '건',
                '| 첫번째:', new Date(first.collectedAtMs).toLocaleString(),
                '| 마지막:', new Date(last.collectedAtMs).toLocaleString());
        }
        if (seriesRef.current && sliced.length > 0) {
            try {
                priceMapRef.current = {};
                sliced.forEach((item) => {
                    const t = Math.floor(item.collectedAtMs / 1000);
                    if (!isNaN(t) && item.price != null) priceMapRef.current[t] = parseFloat(item.price);
                });

                const chartData = sliced
                    .map((item) => ({
                        time: Math.floor(item.collectedAtMs / 1000),
                        value: parseFloat(item.openInterest),
                    }))
                    .filter((item) => !isNaN(item.time) && !isNaN(item.value))
                    .sort((a, b) => a.time - b.time)
                    .filter((item, idx, arr) => idx === 0 || item.time !== arr[idx - 1].time);

                console.log('[OiLineChart] setData', chartData.length, '건',
                    '| 첫봉:', chartData[0] ? new Date(chartData[0].time * 1000).toLocaleString() : '-',
                    '| 마지막봉:', chartData[chartData.length - 1] ? new Date(chartData[chartData.length - 1].time * 1000).toLocaleString() : '-');
                seriesRef.current.setData(chartData);

                // 색상 업데이트 + 현재가 라벨 갱신
                if (chartData.length >= 2) {
                    const lastValue = chartData[chartData.length - 1].value;
                    const prevValue = chartData[chartData.length - 2].value;
                    const isUp = lastValue >= prevValue;
                    const color = isUp ? '#00e887' : '#ff3b5c';

                    seriesRef.current.applyOptions({
                        lineColor: color,
                        topColor: isUp ? 'rgba(0,232,135,0.4)' : 'rgba(255,59,92,0.4)',
                        bottomColor: 'rgba(0,0,0,0.0)',
                    });

                    // 현재가 라벨 위치 계산
                    const label = lastPriceLabelRef.current;
                    if (label) {
                        const y = seriesRef.current.priceToCoordinate(lastValue);
                        if (y !== null) {
                            label.style.top = `${y - 9}px`;
                            label.style.borderColor = color;
                            label.style.color = color;
                            label.textContent = lastValue.toLocaleString();
                            label.style.display = 'block';
                        }
                    }
                }

                chartRef.current?.timeScale().fitContent();
            } catch (err) {
                console.error('[OiLineChart] 데이터 업데이트 에러:', err);
            }
        }

        return () => {
            // cleanup: 컴포넌트 언마운트 시에만 제거
        };
    }, [oiData, rangeMs]);

    return (
        <div style={{ position: 'relative', width: '100%', height: '100%' }}>
            <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
            <div
                ref={lastPriceLabelRef}
                style={{
                    display: 'none',
                    position: 'absolute',
                    right: '4px',
                    pointerEvents: 'none',
                    fontSize: '10px',
                    fontWeight: '600',
                    fontFamily: "'Pretendard', sans-serif",
                    border: '1px solid',
                    borderRadius: '3px',
                    padding: '1px 4px',
                    background: 'rgba(14,15,24,0.85)',
                    zIndex: 9,
                    whiteSpace: 'nowrap',
                }}
            />
            <div
                ref={tooltipRef}
                style={{
                    display: 'none',
                    position: 'absolute',
                    pointerEvents: 'none',
                    background: 'rgba(14,15,24,0.9)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '4px',
                    padding: '5px 8px',
                    color: '#fff',
                    zIndex: 10,
                    whiteSpace: 'nowrap',
                }}
            />
        </div>
    );
}