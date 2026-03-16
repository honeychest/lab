// [AGENT] Signal Dashboard MainCore — 중앙 컨테이너 (TradingViewWidget + MiniChart)
// [AGENT] TASK-09/10/12: symbol, divergenceData, onCandleTime props 추가
// [AGENT] T4-TASK: 상단 슬롯 TradingViewWidget 교체, MiniChartPlaceholder에 longEnergy/shortEnergy 전달
import TradingViewWidget from './TradingViewWidget.jsx';
import MiniChartPlaceholder from './MiniChartPlaceholder.jsx';
import DivergenceBar from './DivergenceBar.jsx';

export default function MainCore({ symbol, longEnergy, shortEnergy, fundingRate, oiData = [], candleHistory = [], candleType, timeRange, displayCount, rangeMs, onCandleTime, onCandleUpdate }) {
    const getFundingBorder = () => {
        if (!fundingRate) return {};

        const abs = Math.abs(fundingRate);
        let borderColor = 'rgba(240,192,64,0.15)';
        let shouldBlink = false;

        if (abs > 0.05) {
            borderColor = 'rgba(240,192,64,0.5)';
            shouldBlink = true;
        } else if (abs > 0.01) {
            borderColor = 'rgba(240,192,64,0.3)';
        }

        return {
            border: `1px solid ${borderColor}`,
            boxShadow: abs > 0.05 ? '0 0 12px rgba(240,192,64,0.2)' : 'none',
            animation: shouldBlink ? 'fundingBorderBlink 4s ease-in-out infinite' : 'none',
        };
    };

    return (
        <div
            style={{
                height: '100%',
                backgroundColor: '#0e0f18',
                borderRadius: '10px',
                padding: '10px',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
                ...getFundingBorder(),
            }}
        >
            <style>{`
                @keyframes fundingBorderBlink {
                    0%, 100% { border-color: rgba(240,192,64,0.5); }
                    50% { border-color: rgba(240,192,64,0.2); }
                }
            `}</style>

            <div style={{ flex: '60%' }}>
                <TradingViewWidget symbol={symbol} />
            </div>

            <DivergenceBar candleHistory={candleHistory} rangeMs={rangeMs} />

            <div style={{ flex: '40%' }}>
                <MiniChartPlaceholder oiData={oiData} symbol={symbol} candleHistory={candleHistory} candleType={candleType} timeRange={timeRange} displayCount={displayCount} rangeMs={rangeMs} onCandleTime={onCandleTime} onCandleUpdate={onCandleUpdate} longEnergy={longEnergy} shortEnergy={shortEnergy} />
            </div>
        </div>
    );
}
