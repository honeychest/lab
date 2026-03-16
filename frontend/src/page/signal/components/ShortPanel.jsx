// [AGENT] Signal Dashboard ShortPanel — 숏 누적 에너지 + 틱 테이프
import { formatWithComma } from '../../../shared/lib/utils.ts';

export default function ShortPanel({ energy, trades, compact = false }) {
    const formatEnergy = (val) => {
        return formatWithComma(Math.floor(val));
    };

    const formatQty = (qty) => parseFloat(qty).toFixed(3);

    return (
        <div
            style={{
                position: 'relative',
                height: '100%',
                backgroundColor: '#0e0f18',
                borderRadius: '10px',
                padding: '10px',
                borderRight: '3px solid #ff3b5c',
                boxShadow: '4px 0 12px rgba(255,59,92,0.15)',
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
            }}
        >
            <div
                style={{
                    fontSize: '13px',
                    color: 'rgba(255,255,255,0.65)',
                    marginBottom: '4px',
                    letterSpacing: '0.5px',
                }}
            >
                {compact ? '' : 'SHORT ENERGY'}
            </div>

            <div
                style={{
                    fontSize: compact ? '20px' : '36px',
                    fontWeight: '700',
                    color: '#ff3b5c',
                    marginBottom: '4px',
                    textAlign: 'center',
                    fontFamily: "'Pretendard', sans-serif",
                }}
            >
                ${formatEnergy(energy)}
            </div>

            <div
                style={{
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px',
                    fontSize: '11px',
                    fontFamily: "'Pretendard', sans-serif",
                    overflow: 'hidden',
                }}
            >
                {[...trades.slice(-20)].reverse().map((trade, idx, arr) => {
                    const isLatest = idx === 0;
                    const total = arr.length;
                    return (
                    <div
                        key={`${trade.tradedAt}-${idx}`}
                        style={{
                            display: 'grid',
                            gridTemplateColumns: '28px 1fr 1fr',
                            color: 'rgba(255,255,255,0.6)',
                            opacity: total < 17 ? 1 : Math.max(0.3, 1 - Math.max(0, idx - 5) * 0.07),
                            animation: isLatest ? 'slideDownFromTop 0.3s ease-out' : 'none',
                        }}
                    >
                        <span style={{ color: trade.marketType === 'FUTURES' ? '#ff3b5c' : 'rgba(255,255,255,0.4)' }}>
                            [{trade.marketType === 'FUTURES' ? 'F' : 'S'}]
                        </span>
                        <span style={{ textAlign: 'right' }}>${formatWithComma(Math.floor(trade.price))}</span>
                        <span style={{ color: 'rgba(255,255,255,0.5)', textAlign: 'right' }}>{formatQty(trade.quantity)}</span>
                    </div>
                    );
                })}
            </div>

            <style>{`
                @keyframes slideDownFromTop {
                    from {
                        transform: translateY(-20px);
                        opacity: 0;
                    }
                    to {
                        transform: translateY(0);
                        opacity: 1;
                    }
                }
            `}</style>
        </div>
    );
}
