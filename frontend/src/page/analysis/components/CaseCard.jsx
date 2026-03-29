// [AGENT] T4-ANALYSIS: 개별 사례 카드 — 날짜·시각 + MiniChart (5분봉 60개)
import MiniChart from '../../../shared/ui/chart/MiniChart.jsx';
import { PALETTE } from '../palette.js';

function build5mCandles(klineData, startIndex, count = 60, windowSize = 5) {
  const candles = [];
  const total   = klineData.length;

  for (let i = 0; i < count; i++) {
    const from = startIndex + i * windowSize;
    const to   = Math.min(from + windowSize, total);
    if (from >= total) break;

    const slice = klineData.slice(from, to);
    if (slice.length === 0) break;

    const open  = slice[0].open;
    const close = slice[slice.length - 1].close;
    const high  = Math.max(...slice.map(c => c.high));
    const low   = Math.min(...slice.map(c => c.low));
    const time  = slice[0].time;

    const volume = slice.reduce((sum, c) => sum + (c.volume ?? 0), 0);
    const delta  = slice.reduce((sum, c) => sum + (c.delta  ?? 0), 0);

    candles.push({ time, open, high, low, close, volume, delta });
  }

  return candles;
}

export default function CaseCard({ matchIndex, klineData, paletteLevel = 'MID', symbol, timeframe = '1m' }) {
  const windowSize = timeframe === '5m' ? 1 : 5;
  const candles = build5mCandles(klineData, matchIndex, 60, windowSize);

  const pal       = PALETTE[paletteLevel] ?? PALETTE.MID;
  const highlights = [{ idx: 0, color: pal.barColor }];

  const timeMs  = klineData[matchIndex]?.time;
  const dateStr = timeMs ? (() => {
    const d = new Date(timeMs);
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    const hh  = String(d.getUTCHours()).padStart(2, '0');
    const mm  = String(d.getUTCMinutes()).padStart(2, '0');
    return `${m}-${day} ${hh}:${mm}`;
  })() : '';

  return (
    <div style={{
      padding:         '6px 8px',
      borderRadius:    '6px',
      background:      'rgba(255,255,255,0.03)',
      border:          '1px solid rgba(255,255,255,0.06)',
      display:         'flex',
      flexDirection:   'column',
      gap:             '4px',
      flexShrink:      0,
    }}>
      <div style={{
        fontSize:   '11px',
        color:      'rgba(255,255,255,0.55)',
        fontFamily: "'Pretendard', sans-serif",
      }}>
        {dateStr}
      </div>
      <div style={{ height: '100px' }}>
        <MiniChart candles={candles} highlights={highlights} symbol={symbol} />
      </div>
    </div>
  );
}
