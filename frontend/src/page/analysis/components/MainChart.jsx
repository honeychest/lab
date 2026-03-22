// [AGENT] T4-ANALYSIS: 메인 캔들 차트 — 1분봉 + 매칭 봉 하이라이트 + 호버 툴팁(전체 봉)
import { useEffect, useRef, useState } from 'react';
import { createChart, CandlestickSeries, createSeriesMarkers, LineStyle } from 'lightweight-charts';
import { PALETTE } from '../palette.js';

const DEBOUNCE_MS = 200;

function buildMarkers(klineData, matchedIndices, paletteLevel) {
  const pal = PALETTE[paletteLevel] ?? PALETTE.MID;
  return matchedIndices
    .map((idx) => {
      const c = klineData[idx];
      if (!c) return null;
      return {
        time:     Math.floor(c.time / 1000),
        position: 'belowBar',
        color:    pal.iconColor,
        shape:    'arrowUp',
        size:     1,
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.time - b.time);
}

// 하이라이트: 메인 차트 영역 전체를 덮는 세로 띠 (안정성 우선)
function calcOverlayPositions(klineData, matchedIndices, paletteLevel, timeScale) {
  if (klineData.length < 2 || matchedIndices.length === 0) return [];
  const pal = PALETTE[paletteLevel] ?? PALETTE.MID;

  let barWidth = 4;
  const x0 = timeScale.timeToCoordinate(Math.floor(klineData[0].time / 1000));
  const x1 = timeScale.timeToCoordinate(Math.floor(klineData[1].time / 1000));
  if (x0 !== null && x1 !== null) barWidth = Math.max(2, Math.abs(x1 - x0));

  return matchedIndices.map((idx) => {
    const c = klineData[idx];
    if (!c) return null;
    const x = timeScale.timeToCoordinate(Math.floor(c.time / 1000));
    if (x === null) return null;

    return {
      x:      x - barWidth / 2,
      width:  barWidth,
      color:  pal.bgColor,
    };
  }).filter(Boolean);
}

export default function MainChart({ klineData, matchedIndices, paletteLevel, loading, error, onRetry }) {
  const containerRef      = useRef(null);
  const chartRef          = useRef(null);
  const seriesRef         = useRef(null);
  const markersWrapperRef = useRef(null);
  const isInitRef         = useRef(false);
  const debounceTimer     = useRef(null);
  const klineRef          = useRef(klineData);
  const matchedRef        = useRef(matchedIndices);
  const paletteLevelRef   = useRef(paletteLevel);

  const [overlayPositions, setOverlayPositions] = useState([]);
  const [tooltip, setTooltip]                   = useState(null);
  const matchedSet = useRef(new Set(matchedIndices));

  useEffect(() => { klineRef.current       = klineData;       }, [klineData]);
  useEffect(() => { matchedRef.current     = matchedIndices;  }, [matchedIndices]);
  useEffect(() => { paletteLevelRef.current = paletteLevel;   }, [paletteLevel]);
  useEffect(() => { matchedSet.current     = new Set(matchedIndices); }, [matchedIndices]);

  // 차트 초기화
  useEffect(() => {
    if (!containerRef.current || isInitRef.current) return;

    const chart = createChart(containerRef.current, {
      autoSize:     true,
      handleScale:  true,
      handleScroll: true,
      layout: {
        background:      { color: 'transparent' },
        textColor:       'rgba(255,255,255,0.3)',
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: 'rgba(255,255,255,0.03)' },
        horzLines: { color: 'rgba(255,255,255,0.03)' },
      },
      timeScale:       { visible: true, borderColor: 'rgba(255,255,255,0.06)' },
      rightPriceScale: { visible: true, borderColor: 'rgba(255,255,255,0.06)' },
      crosshair: {
        horzLine: { labelVisible: true },
        vertLine: { labelVisible: true },
      },
    });

    const series = chart.addSeries(CandlestickSeries, {
      upColor:          'rgba(80,160,255,0.9)',
      downColor:        'rgba(255,160,50,0.9)',
      borderUpColor:    'rgba(80,160,255,0.9)',
      borderDownColor:  'rgba(255,160,50,0.9)',
      wickUpColor:      'rgba(80,160,255,0.6)',
      wickDownColor:    'rgba(255,160,50,0.6)',
      lastValueVisible: false,
      priceLineVisible: false,
    });

    markersWrapperRef.current = createSeriesMarkers(series, []);

    chart.timeScale().subscribeVisibleLogicalRangeChange(() => {
      clearTimeout(debounceTimer.current);
      debounceTimer.current = setTimeout(() => {
        if (!chartRef.current) return;
        setOverlayPositions(
          calcOverlayPositions(
            klineRef.current,
            matchedRef.current,
            paletteLevelRef.current,
            chart.timeScale(),
          )
        );
      }, DEBOUNCE_MS);
    });

    // 호버 툴팁 — 전체 봉 표시
    chart.subscribeCrosshairMove((param) => {
      if (!param.point || !param.time || !containerRef.current) { setTooltip(null); return; }
      const data = param.seriesData?.get(series);
      if (!data) { setTooltip(null); return; }

      const timeMs  = param.time * 1000;
      const klines  = klineRef.current;
      const idx     = klines.findIndex((c) => Math.floor(c.time / 1000) === param.time
                                            || Math.abs(c.time - timeMs) < 60_000);
      if (idx === -1) { setTooltip(null); return; }

      const c      = klines[idx];
      const pctChg = c.open !== 0 ? ((c.close - c.open) / c.open * 100).toFixed(2) : '0.00';
      setTooltip({
        x:          param.point.x,
        y:          param.point.y,
        time:       param.time,
        volume:     c.volume,
        delta:      c.delta,
        priceChg:   pctChg,
        isMatched:  matchedSet.current.has(idx),
        containerW: containerRef.current?.clientWidth ?? 0,
      });
    });

    chartRef.current  = chart;
    seriesRef.current = series;
    isInitRef.current = true;

    return () => {
      clearTimeout(debounceTimer.current);
      chart.remove();
      chartRef.current          = null;
      seriesRef.current         = null;
      markersWrapperRef.current = null;
      isInitRef.current         = false;
    };
  }, []);

  const applyMatched = () => {
    if (!markersWrapperRef.current || !chartRef.current) return;
    markersWrapperRef.current.setMarkers(buildMarkers(klineRef.current, matchedRef.current, paletteLevelRef.current));
    setOverlayPositions(
      calcOverlayPositions(
        klineRef.current,
        matchedRef.current,
        paletteLevelRef.current,
        chartRef.current.timeScale(),
      )
    );
  };

  // klineData 변경 → 차트 전체 재세팅
  useEffect(() => {
    if (!seriesRef.current || !chartRef.current || klineData.length === 0) return;
    const bars = klineData
      .map((c) => ({ time: Math.floor(c.time / 1000), open: c.open, high: c.high, low: c.low, close: c.close }))
      .sort((a, b) => a.time - b.time)
      .filter((item, i, arr) => i === 0 || item.time !== arr[i - 1].time);
    seriesRef.current.setData(bars);
    // Y축 여백 최소화
    seriesRef.current.priceScale().applyOptions({
      scaleMargins: { top: 0.02, bottom: 0.02 },
    });
    chartRef.current.timeScale().fitContent();
    applyMatched();
  }, [klineData]);

  // matchedIndices / paletteLevel 변경 → 하이라이트만 갱신
  useEffect(() => {
    if (!seriesRef.current) return;
    applyMatched();
  }, [matchedIndices, paletteLevel]);

  const tooltipEl = tooltip && (() => {
    const containerW = tooltip.containerW ?? 0;
    const left = tooltip.x + 12 + 160 > containerW ? tooltip.x - 172 : tooltip.x + 12;
    const isNetBuy   = tooltip.delta >= 0;
    const deltaColor = isNetBuy
      ? 'rgba(var(--buy-rgb), 0.9)'
      : 'rgba(var(--sell-rgb), 0.9)';
    const deltaLabel = isNetBuy ? '순매수' : '순매도';
    const deltaValue = Math.abs(tooltip.delta);
    const timeStr = (() => {
      const d = new Date(tooltip.time * 1000);
      const pad = (n) => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    })();
    return (
      <div style={{
        position:      'absolute',
        left,
        top:           Math.max(4, tooltip.y - 36),
        background:    'rgba(14,15,24,0.95)',
        border:        `1px solid ${tooltip.isMatched ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.1)'}`,
        borderRadius:  '6px',
        padding:       '5px 10px',
        pointerEvents: 'none',
        fontFamily:    "'Pretendard', sans-serif",
        fontSize:      '11px',
        lineHeight:    '1.7',
        whiteSpace:    'nowrap',
        zIndex:        10,
      }}>
        <div style={{ color: 'rgba(255,255,255,0.45)', marginBottom: '2px' }}>
          {timeStr}
        </div>
        <div style={{ color: 'rgba(255,255,255,0.6)' }}>
          거래량 {Number(tooltip.volume).toLocaleString(undefined, { maximumFractionDigits: 2 })}
        </div>
        <div style={{ color: deltaColor }}>
          {deltaLabel} {Number(deltaValue).toLocaleString(undefined, { maximumFractionDigits: 2 })}
        </div>
        <div style={{ color: 'rgba(255,255,255,0.7)' }}>
          가격변화 {tooltip.priceChg}%
        </div>
      </div>
    );
  })();

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />

      {/* 로딩 스피너 */}
      {loading && (
        <div style={{
          position:       'absolute',
          inset:          0,
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'center',
          background:     'rgba(6,6,12,0.5)',
          zIndex:         5,
        }}>
          <div style={{
            width:        '28px',
            height:       '28px',
            border:       '3px solid rgba(255,255,255,0.08)',
            borderTop:    '3px solid rgba(80,160,255,0.7)',
            borderRadius: '50%',
            animation:    'spin 0.8s linear infinite',
          }} />
        </div>
      )}

      {/* 에러 */}
      {!loading && error && (
        <div style={{
          position:       'absolute',
          inset:          0,
          display:        'flex',
          flexDirection:  'column',
          alignItems:     'center',
          justifyContent: 'center',
          gap:            '8px',
          zIndex:         5,
        }}>
          <div style={{ fontSize: '0.94rem', color: '#ff3b5c', fontFamily: "'Pretendard', sans-serif" }}>
            데이터를 불러오지 못했습니다.
          </div>
          <div style={{ fontSize: '0.81rem', color: 'rgba(255,255,255,0.4)', fontFamily: "'Pretendard', sans-serif" }}>
            {error.status ? `HTTP ${error.status} — ${error.message}` : error.message}
          </div>
          <button
            onClick={onRetry}
            style={{
              marginTop:    '4px',
              padding:      '5px 14px',
              background:   'rgba(255,255,255,0.08)',
              border:       '1px solid rgba(255,255,255,0.15)',
              borderRadius: '4px',
              color:        'rgba(255,255,255,0.8)',
              fontSize:     '12px',
              cursor:       'pointer',
              fontFamily:   "'Pretendard', sans-serif",
            }}
          >다시 시도</button>
        </div>
      )}

      {/* 매칭 봉 오버레이 */}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 2 }}>
        {overlayPositions.map((h, i) => (
          <span key={i} style={{
            position:        'absolute',
            left:            h.x,
            width:           h.width,
            top:             0,
            bottom:          0,
            backgroundColor: h.color,
            pointerEvents:   'none',
          }} />
        ))}
      </div>

      {tooltipEl}
    </div>
  );
}
