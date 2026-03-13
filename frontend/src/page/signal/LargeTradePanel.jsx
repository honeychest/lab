// [AGENT] Signal Dashboard LargeTradePanel — 대형체결 이벤트 스택
import { formatWithComma } from '../../shared/lib/utils.ts';

export default function LargeTradePanel({ events }) {
    const formatQty = (qty) => {
        return formatWithComma(Math.floor(qty * 100) / 100);
    };

    return (
        <div
            style={{
                height: '100%',
                backgroundColor: '#0e0f18',
                borderRadius: '10px',
                padding: '10px',
                border: '1px solid rgba(255,255,255,0.06)',
                overflow: 'hidden',
            }}
        >
            <div
                style={{
                    fontSize: '13px',
                    color: 'rgba(255,255,255,0.65)',
                    marginBottom: '12px',
                    letterSpacing: '0.5px',
                }}
            >
                LARGE TRADES
            </div>

            <div
                style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px',
                }}
            >
                {events.slice(0, 4).map((event, idx) => (
                    <div
                        key={`${event.timestamp}-${idx}`}
                        style={{
                            padding: '10px 12px',
                            borderRadius: '6px',
                            backgroundColor: event.direction === 'BUY' ? 'rgba(0,232,135,0.08)' : 'rgba(255,59,92,0.08)',
                            border: `1px solid ${event.direction === 'BUY' ? 'rgba(0,232,135,0.2)' : 'rgba(255,59,92,0.2)'}`,
                            opacity: idx === 0 ? 1 : idx === 1 ? 0.6 : 0.35,
                            animation: idx === 0 ? 'scaleIn 0.3s ease-out' : 'none',
                            transition: 'all 0.3s',
                        }}
                    >
                        <div
                            style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                            }}
                        >
                            <span
                                style={{
                                    fontSize: '13px',
                                    fontWeight: '600',
                                    color: event.direction === 'BUY' ? '#00e887' : '#ff3b5c',
                                    fontFamily: "'Pretendard', sans-serif",
                                }}
                            >
                                {event.direction}
                                {event.count > 1 && ` ×${event.count}`}
                            </span>
                            <span
                                style={{
                                    fontSize: '12px',
                                    color: 'rgba(255,255,255,0.7)',
                                    fontFamily: "'Pretendard', sans-serif",
                                }}
                            >
                                {formatQty(event.quantity)} {event.symbol.replace('USDT', '')}
                            </span>
                        </div>
                    </div>
                ))}
            </div>

            <style>{`
                @keyframes scaleIn {
                    from {
                        transform: scale(0.95);
                        opacity: 0;
                    }
                    to {
                        transform: scale(1);
                        opacity: 1;
                    }
                }
            `}</style>
        </div>
    );
}
