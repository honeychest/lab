// [AGENT] Signal Dashboard MiniChartPlaceholder — 미니차트 자리 확보
// [AGENT] TASK-09: FUTURES 슬롯 → CandleChart 교체
import OiLineChart from './OiLineChart.jsx';
import CandleChart from './CandleChart.jsx';

function getLastOiValue(oiData) {
    if (!oiData || oiData.length === 0) return null;
    const sorted = [...oiData].sort((a, b) => b.collectedAtMs - a.collectedAtMs);
    const val = parseFloat(sorted[0].openInterest);
    if (val >= 1_000_000) return (val / 1_000_000).toFixed(2) + 'M';
    if (val >= 1_000) return (val / 1_000).toFixed(1) + 'K';
    return val.toFixed(0);
}

export default function MiniChartPlaceholder({ oiData = [], symbol, candleHistory = [], candleType, rangeMs, onCandleTime, onCandleUpdate }) {
    const lastOiValue = getLastOiValue(oiData);

    return (
        <div
            style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: '8px',
                height: '100%',
            }}
        >
            {['FUTURES', '오픈 포지션 볼륨', 'SPREAD'].map((label) => (
                <div
                    key={label}
                    style={{
                        backgroundColor: 'rgba(255,255,255,0.015)',
                        borderRadius: '6px',
                        padding: '12px',
                        border: '1px solid rgba(255,255,255,0.04)',
                        display: 'flex',
                        flexDirection: 'column',
                    }}
                >
                    <div
                        style={{
                            fontSize: '11px',
                            color: 'rgba(255,255,255,0.72)',
                            letterSpacing: '0.5px',
                            marginBottom: '8px',
                            fontFamily: "'Pretendard', sans-serif",
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                        }}
                    >
                        <span>{label}</span>
                        {label === '오픈 포지션 볼륨' && lastOiValue && (
                            <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '10px', fontWeight: '600' }}>
                                {lastOiValue}
                            </span>
                        )}
                    </div>
                    <div
                        style={{
                            width: '100%',
                            height: '70px',
                            flex: 1,
                        }}
                    >
                        {label === '오픈 포지션 볼륨' ? (
                            <OiLineChart oiData={oiData} rangeMs={rangeMs} />
                        ) : label === 'FUTURES' ? (
                            <CandleChart symbol={symbol} candleHistory={candleHistory} candleType={candleType} onCandleTime={onCandleTime} onCandleUpdate={onCandleUpdate} />
                        ) : (
                            <div
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    color: 'rgba(255,255,255,0.1)',
                                    fontSize: '10px',
                                    height: '100%',
                                }}
                            >
                                TBD
                            </div>
                        )}
                    </div>
                </div>
            ))}
        </div>
    );
}
