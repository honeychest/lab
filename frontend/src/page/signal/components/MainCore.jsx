// [AGENT] Signal Dashboard MainCore — 중앙 컨테이너 (Gauge + TugOfWar + MiniChart)
import EnergyGauge from './EnergyGauge.jsx';
import TugOfWar from './TugOfWar.jsx';
import MiniChartPlaceholder from './MiniChartPlaceholder.jsx';

export default function MainCore({ longEnergy, shortEnergy, fundingRate, oiData = [] }) {
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

            <div style={{ flex: '60%', position: 'relative' }}>
                <EnergyGauge longEnergy={longEnergy} shortEnergy={shortEnergy} />
                <TugOfWar longEnergy={longEnergy} shortEnergy={shortEnergy} />
                <div
                    style={{
                        position: 'absolute',
                        bottom: '20px',
                        left: '30px',
                        fontSize: '10px',
                        color: 'rgba(0,232,135,0.35)',
                        fontFamily: "'Pretendard', sans-serif",
                    }}
                >
                    LONG
                </div>
                <div
                    style={{
                        position: 'absolute',
                        bottom: '20px',
                        right: '30px',
                        fontSize: '10px',
                        color: 'rgba(255,59,92,0.35)',
                        fontFamily: "'Pretendard', sans-serif",
                    }}
                >
                    SHORT
                </div>
            </div>

            <div style={{ flex: '40%' }}>
                <MiniChartPlaceholder oiData={oiData} />
            </div>
        </div>
    );
}
