// [AGENT] T4-ANALYSIS: 공용 미니차트 — StealthChart 기반 일반화. highlights[].color 직접 주입.
// StealthSlot + AnalysisPage CasesPanel 공용
import { useEffect, useRef, useState } from 'react';
import { createChart, CandlestickSeries, LineSeries, createSeriesMarkers, LineStyle } from 'lightweight-charts';

const DEBOUNCE_MS = 200;

// 하이라이트: 차트 캔들 영역 전체를 덮는 세로 띠 (안정성 우선)
function calcByCoordinate(candles, highlights, tempHighlight, tempHighlightColor, timeScale) {
  if (candles.length === 0) return [];
  const items = [...highlights];
  if (tempHighlight && tempHighlightColor) {
    items.push({ idx: candles.length - 1, color: tempHighlightColor });
  }

  let barWidth = 4;
  if (candles.length >= 2) {
    const x0 = timeScale.timeToCoordinate(Math.floor(candles[0].time / 1000));
    const x1 = timeScale.timeToCoordinate(Math.floor(candles[1].time / 1000));
    if (x0 !== null && x1 !== null) barWidth = Math.max(2, Math.abs(x1 - x0));
  }

  return items.map((h) => {
    const candle = candles[Math.min(h.idx, candles.length - 1)];
    if (!candle) return null;
    const x = timeScale.timeToCoordinate(Math.floor(candle.time / 1000));
    if (x === null) return null;

    return {
      x:      x - barWidth / 2,
      width:  barWidth,
      color:  h.color,
    };
  }).filter(Boolean);
}

function buildMarkers(candles, highlights, tempHighlight, tempHighlightColor) {
  const items = [...highlights];
  if (tempHighlight && tempHighlightColor) {
    items.push({ idx: candles.length - 1, color: tempHighlightColor });
  }
  return items.map((h) => {
    const candle = candles[Math.min(h.idx, candles.length - 1)];
    if (!candle) return null;
    return {
      time:     Math.floor(candle.time / 1000),
      position: 'belowBar',
      color:    h.color,
      shape:    'arrowUp',
      size:     1,
    };
  }).filter(Boolean).sort((a, b) => a.time - b.time);
}

export default function MiniChart({
  candles = [],
  highlights = [],       // [{ idx, color }] — 색상 직접 주입
  chartType = 'candle',
  liveCandle = null,
  tempHighlight = false,
  tempHighlightColor = null,
  symbol = null,
}) {
  const containerRef      = useRef(null);
  const chartRef          = useRef(null);
  const seriesRef         = useRef(null);
  const markersWrapperRef = useRef(null);
  const priceLineHighRef  = useRef(null);
  const priceLineLowRef   = useRef(null);
  const isInitRef         = useRef(false);
  const debounceTimer     = useRef(null);
  const fitDebounceRef    = useRef(null);
  const fitCooldownRef    = useRef(false);
  const candlesRef        = useRef(candles);
  const highlightsRef     = useRef(highlights);
  const tempHighlightRef  = useRef(tempHighlight);
  const tempHlColorRef    = useRef(tempHighlightColor);
  const dayHighRef        = useRef(null);
  const dayLowRef         = useRef(null);

  const [hlPositions, setHlPositions] = useState([]);
  const [tooltip, setTooltip]         = useState(null);
  const [loading, setLoading]         = useState(true);

  useEffect(() => { candlesRef.current      = candles;           }, [candles]);
  useEffect(() => { highlightsRef.current   = highlights;        }, [highlights]);
  useEffect(() => { tempHighlightRef.current = tempHighlight;    }, [tempHighlight]);
  useEffect(() => { tempHlColorRef.current  = tempHighlightColor; }, [tempHighlightColor]);

  // 차트 초기화 (한 번만)
  useEffect(() => {
    if (!containerRef.current || isInitRef.current) return;
    const chart = createChart(containerRef.current, {
      autoSize:     true,
      handleScale:  true,
      handleScroll: true,
      layout: {
        background:      { color: 'transparent' },
        textColor:       'rgba(255,255,255,0.2)',
        attributionLogo: false,
      },
      grid: {
        vertLines: { visible: false },
        horzLines: { visible: false },
      },
      timeScale:       { visible: false },
      rightPriceScale: { visible: false },
      crosshair: {
        horzLine: { visible: false },
        vertLine: { visible: false },
      },
    });

    let series;
    if (chartType === 'candle') {
      series = chart.addSeries(CandlestickSeries, {
        upColor:          'rgba(80,160,255,0.9)',
        downColor:        'rgba(255,160,50,0.9)',
        borderUpColor:    'rgba(80,160,255,0.9)',
        borderDownColor:  'rgba(255,160,50,0.9)',
        wickUpColor:      'rgba(80,160,255,0.6)',
        wickDownColor:    'rgba(255,160,50,0.6)',
        lastValueVisible: false,
        priceLineVisible: false,
      });
    } else {
      series = chart.addSeries(LineSeries, {
        color:                  'rgba(80,160,255,0.8)',
        lineWidth:              1,
        crosshairMarkerVisible: false,
        lastValueVisible:       false,
        priceLineVisible:       false,
      });
    }

    markersWrapperRef.current = createSeriesMarkers(series, []);

    chart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
      if (range && candlesRef.current.length > 0) {
        const visibleBars = range.to - range.from;
        if (visibleBars > candlesRef.current.length && !fitCooldownRef.current) {
          clearTimeout(fitDebounceRef.current);
          fitDebounceRef.current = setTimeout(() => {
            chart.timeScale().fitContent();
            fitCooldownRef.current = true;
            setTimeout(() => { fitCooldownRef.current = false; }, 300);
          }, 200);
          return;
        }
      }

      clearTimeout(debounceTimer.current);
      debounceTimer.current = setTimeout(() => {
        if (!chartRef.current) return;
        setHlPositions(
          calcByCoordinate(
            candlesRef.current,
            highlightsRef.current,
            tempHighlightRef.current,
            tempHlColorRef.current,
            chart.timeScale(),
          )
        );
      }, DEBOUNCE_MS);
    });

    chart.subscribeCrosshairMove((param) => {
      if (!param.point || !param.time || !containerRef.current) {
        setTooltip(null);
        return;
      }
      const data = param.seriesData?.get(series);
      if (!data) { setTooltip(null); return; }

      const timeMs = param.time * 1000;
      const candle = candlesRef.current.find((c) => Math.floor(c.time / 1000) === param.time)
                  ?? candlesRef.current.find((c) => Math.abs(c.time - timeMs) < 150_000);
      const delta   = candle?.delta ?? null;
      const volume  = candle?.volume ?? null;

      setTooltip({
        x:          param.point.x,
        y:          param.point.y,
        time:       param.time,
        close:      data.close,
        delta,
        volume,
        dayHigh:    dayHighRef.current,
        dayLow:     dayLowRef.current,
        containerW: containerRef.current?.clientWidth ?? 0,
      });
    });

    chartRef.current  = chart;
    seriesRef.current = series;
    isInitRef.current = true;

    if (candlesRef.current.length > 0) {
      applyChartData(series, chart, candlesRef.current, highlightsRef.current, tempHighlightRef.current, tempHlColorRef.current);
    }

    return () => {
      clearTimeout(debounceTimer.current);
      clearTimeout(fitDebounceRef.current);
      chart.remove();
      chartRef.current          = null;
      seriesRef.current         = null;
      markersWrapperRef.current = null;
      priceLineHighRef.current  = null;
      priceLineLowRef.current   = null;
      isInitRef.current         = false;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const applyChartData = (series, chart, candles, highlights, tempHighlight, tempHighlightColor) => {
    if (!series || candles.length === 0) return;

    if (chartType === 'candle') {
      const bars = candles
        .map((c) => ({
          time:  Math.floor(c.time / 1000),
          open:  c.open,
          high:  c.high,
          low:   c.low,
          close: c.close,
        }))
        .sort((a, b) => a.time - b.time)
        .filter((item, idx, arr) => idx === 0 || item.time !== arr[idx - 1].time);
      series.setData(bars);
    } else {
      series.setData(candles.map((c, i) => ({ time: i + 1, value: c.close })));
    }

    // Y축 여백 최소화 — 세로 영역을 더 꽉 사용
    series.priceScale().applyOptions({
      scaleMargins: {
        top: 0.02,
        bottom: 0.02,
      },
    });

    updatePriceLinesInternal(series, candles);
    markersWrapperRef.current?.setMarkers(buildMarkers(candles, highlights, tempHighlight, tempHighlightColor));
    chart.timeScale().fitContent();
    requestAnimationFrame(() => {
      if (chartRef.current === chart) chart.timeScale().fitContent();
    });
    setHlPositions(
      calcByCoordinate(
        candles,
        highlights,
        tempHighlight,
        tempHighlightColor,
        chart.timeScale(),
      )
    );
    setLoading(false);
  };

  const updatePriceLinesInternal = (series, candles) => {
    if (priceLineHighRef.current) { series.removePriceLine(priceLineHighRef.current); priceLineHighRef.current = null; }
    if (priceLineLowRef.current)  { series.removePriceLine(priceLineLowRef.current);  priceLineLowRef.current  = null; }
    if (candles.length === 0) return;

    const dayHigh = Math.max(...candles.map((c) => c.high));
    const dayLow  = Math.min(...candles.map((c) => c.low));
    dayHighRef.current = dayHigh;
    dayLowRef.current  = dayLow;

    priceLineHighRef.current = series.createPriceLine({
      price:            dayHigh,
      color:            'rgba(80,160,255,0.35)',
      lineWidth:        1,
      lineStyle:        LineStyle.Dashed,
      axisLabelVisible: false,
    });
    priceLineLowRef.current = series.createPriceLine({
      price:            dayLow,
      color:            'rgba(255,160,50,0.35)',
      lineWidth:        1,
      lineStyle:        LineStyle.Dashed,
      axisLabelVisible: false,
    });
  };

  // candles 변경
  useEffect(() => {
    if (!seriesRef.current || !chartRef.current || candles.length === 0) return;
    applyChartData(seriesRef.current, chartRef.current, candles, highlights, tempHighlight, tempHighlightColor);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candles, chartType]);

  // highlights / tempHighlight 변경
  useEffect(() => {
    if (!seriesRef.current || candles.length === 0) return;
    markersWrapperRef.current?.setMarkers(buildMarkers(candles, highlights, tempHighlight, tempHighlightColor));
    if (chartRef.current) {
      setHlPositions(
        calcByCoordinate(
          candles,
          highlights,
          tempHighlight,
          tempHighlightColor,
          chartRef.current.timeScale(),
        )
      );
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlights, tempHighlight, tempHighlightColor]);

  // liveCandle 갱신
  useEffect(() => {
    if (!seriesRef.current || !liveCandle || chartType !== 'candle') return;
    seriesRef.current.update(liveCandle);
  }, [liveCandle, chartType]);

  const tooltipEl = tooltip && (() => {
    const date     = new Date(tooltip.time * 1000);
    const timeStr  = `${date.getMonth() + 1}/${date.getDate()} ${date.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })}`;
    const close    = tooltip.close;
    const closeStr = Number(close).toLocaleString(undefined, { maximumFractionDigits: 2 });

    const volume   = tooltip.volume;
    const volumeStr = volume != null
      ? Number(volume).toLocaleString(undefined, { maximumFractionDigits: 2 })
      : null;

    const deltaColor = tooltip.delta >= 0
      ? 'rgba(var(--buy-rgb), 0.9)'
      : 'rgba(var(--sell-rgb), 0.9)';
    const deltaLabel = tooltip.delta >= 0 ? '순매수' : '순매도';
    const deltaStr   = tooltip.delta != null
      ? `${deltaLabel} ${tooltip.delta >= 0 ? '+' : ''}${Number(tooltip.delta).toLocaleString(undefined, { maximumFractionDigits: 2 })}`
      : null;

    const { dayHigh, dayLow } = tooltip;
    let highDiffStr = null;
    let lowDiffStr  = null;
    if (dayHigh != null && close > 0) {
      const pct   = ((dayHigh - close) / close * 100).toFixed(2);
      const price = (dayHigh - close).toLocaleString(undefined, { maximumFractionDigits: 2 });
      highDiffStr = `고점 +${pct}% (+${price})`;
    }
    if (dayLow != null && close > 0) {
      const pct   = ((close - dayLow) / close * 100).toFixed(2);
      const price = (close - dayLow).toLocaleString(undefined, { maximumFractionDigits: 2 });
      lowDiffStr = `저점 -${pct}% (-${price})`;
    }

    const containerW = tooltip.containerW ?? 0;
    const left = tooltip.x + 12 + 150 > containerW ? tooltip.x - 162 : tooltip.x + 12;

    return (
      <div style={{
        position:      'absolute',
        left,
        top:           Math.max(4, tooltip.y - 30),
        background:    'rgba(14,15,24,0.92)',
        border:        '1px solid rgba(255,255,255,0.1)',
        borderRadius:  '6px',
        padding:       '4px 8px',
        pointerEvents: 'none',
        fontFamily:    "'Pretendard', sans-serif",
        fontSize:      '11px',
        lineHeight:    '1.6',
        whiteSpace:    'nowrap',
        zIndex:        10,
      }}>
        <div style={{ color: 'rgba(255,255,255,0.45)' }}>{timeStr}</div>
        <div style={{ color: 'rgba(255,255,255,0.85)', fontWeight: 600 }}>종가 {closeStr}</div>
        {volumeStr && (
          <div style={{ color: 'rgba(255,255,255,0.6)' }}>
            거래량 {volumeStr}{symbol ? ` ${symbol}` : ''}
          </div>
        )}
        {deltaStr && <div style={{ color: deltaColor, fontWeight: 600 }}>{deltaStr}</div>}
        {highDiffStr && <div style={{ color: 'rgba(80,160,255,0.7)' }}>{highDiffStr}</div>}
        {lowDiffStr  && <div style={{ color: 'rgba(255,160,50,0.7)'  }}>{lowDiffStr}</div>}
      </div>
    );
  })();

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
      {loading && (
        <div style={{
          position:       'absolute',
          inset:          0,
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'center',
          background:     'transparent',
          pointerEvents:  'none',
        }}>
          <div style={{
            width:        '16px',
            height:       '16px',
            border:       '2px solid rgba(255,255,255,0.1)',
            borderTop:    '2px solid rgba(255,255,255,0.45)',
            borderRadius: '50%',
            animation:    'spin 0.8s linear infinite',
          }} />
        </div>
      )}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
        {hlPositions.map((h, i) => (
          <span
            key={i}
            style={{
              position:        'absolute',
              left:            h.x,
              width:           h.width,
              top:             0,
              bottom:          0,
              backgroundColor: h.color,
              opacity:         0.25,
              pointerEvents:   'none',
            }}
          />
        ))}
      </div>
      {tooltipEl}
    </div>
  );
}
