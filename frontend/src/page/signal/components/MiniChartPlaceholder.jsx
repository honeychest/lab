// [AGENT] Signal Dashboard MiniChartPlaceholder — 미니차트 자리 확보
// [AGENT] TASK-09: FUTURES 슬롯 → CandleChart 교체
// [AGENT] T4-TASK: 슬롯 재배치 — 가운데(EnergyGauge+TugOfWar), 오른쪽(OiLineChart)
import OiLineChart from './OiLineChart.jsx';
import CandleChart from './CandleChart.jsx';
import EnergyGauge from './EnergyGauge.jsx';
import TugOfWar from './TugOfWar.jsx';

function getLastOiValue(oiData, symbol) {
    if (!oiData || oiData.length === 0) return null;
    const sorted = [...oiData].sort((a, b) => b.collectedAtMs - a.collectedAtMs);
    const val = parseFloat(sorted[0].openInterest);
    return Math.round(val).toLocaleString() + ' ' + symbol.replace('USDT', '');
}

function getLastDelta(candleHistory, symbol) {
    if (!candleHistory || candleHistory.length === 0) return null;
    const sorted = [...candleHistory].sort((a, b) => b.time - a.time);
    const delta = sorted[0]?.delta ?? null;
    if (delta === null) return null;
    const label = delta >= 0 ? '순매수' : '순매도';
    const sign  = delta >= 0 ? '+' : '';
    return { label, text: `${label} ${sign}${Number(delta).toLocaleString(undefined, { maximumFractionDigits: 2 })} ${symbol.replace('USDT', '')}`, positive: delta >= 0 };
}

const slotStyle = {
    backgroundColor: 'var(--black-surface-bg)',
    borderRadius: '6px',
    padding: '12px',
    border: '1px solid var(--black-border-subtle)',
    display: 'flex',
    flexDirection: 'column',
};

const labelStyle = {
    fontSize: '11px',
    color: 'var(--black-text-secondary)',
    letterSpacing: '0.5px',
    marginBottom: '8px',
    fontFamily: "'Pretendard', sans-serif",
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
};

const contentStyle = {
    width: '100%',
    height: '70px',
    flex: 1,
};

export default function MiniChartPlaceholder({ oiData = [], symbol, candleHistory = [], candleType, rangeMs, onCandleTime, onCandleUpdate, longEnergy, shortEnergy }) {
    const lastOiValue  = getLastOiValue(oiData, symbol);
    const lastDelta    = getLastDelta(candleHistory, symbol);

    return (
        <div
            style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: '8px',
                height: '100%',
            }}
        >
            {/* 왼쪽: FUTURES */}
            <div style={slotStyle}>
                <div style={labelStyle}>
                    <span>FUTURES</span>
                    {lastDelta && (
                        <span style={{ color: lastDelta.positive ? 'rgba(80,160,255,0.9)' : 'rgba(255,160,50,0.9)', fontSize: '10px', fontWeight: '600' }}>
                            {lastDelta.text}
                        </span>
                    )}
                </div>
                <div style={contentStyle}>
                    <CandleChart symbol={symbol} candleHistory={candleHistory} candleType={candleType} onCandleTime={onCandleTime} onCandleUpdate={onCandleUpdate} />
                </div>
            </div>

            {/* 가운데: Signal (EnergyGauge + TugOfWar) */}
            <div style={slotStyle}>
                <div style={labelStyle}>
                    <span>Signal</span>
                </div>
                <div style={{ ...contentStyle, overflow: 'hidden', position: 'relative' }}>
                    <EnergyGauge longEnergy={longEnergy} shortEnergy={shortEnergy} compact />
                    <TugOfWar longEnergy={longEnergy} shortEnergy={shortEnergy} />
                </div>
            </div>

            {/* 오른쪽: 오픈 포지션 볼륨 */}
            <div style={slotStyle}>
                <div style={labelStyle}>
                    <span>오픈 포지션 볼륨</span>
                    {lastOiValue && (
                        <span style={{ color: 'var(--black-text-muted)', fontSize: '10px', fontWeight: '600' }}>
                            {lastOiValue}
                        </span>
                    )}
                </div>
                <div style={contentStyle}>
                    <OiLineChart oiData={oiData} rangeMs={rangeMs} />
                </div>
            </div>
        </div>
    );
}
