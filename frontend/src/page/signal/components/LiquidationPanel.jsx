// [AGENT] Signal Dashboard LiquidationPanel — 롱 청산 이벤트 목록 + 누계 합계
import { formatWithComma } from '../../../shared/lib/utils.ts';

export default function LiquidationPanel({ total = 0, events = [] }) {
    const formatTotal = (val) => formatWithComma(Math.floor(val));
    const formatValue = (price, qty) => {
        const val = parseFloat(price) * parseFloat(qty);
        return '$' + Math.floor(val).toLocaleString();
    };

    return (
        <div
            style={{
                height: '100%',
                backgroundColor: 'var(--black-panel-bg)',
                borderRadius: '10px',
                padding: '10px',
                border: '1px solid var(--black-border)',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
            }}
        >
            <div
                style={{
                    fontSize: '13px',
                    color: 'var(--black-text-secondary)',
                    marginBottom: '8px',
                    letterSpacing: '0.5px',
                }}
            >
                롱 청산
            </div>

            <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: '3px' }}>
                {events.slice(0, 12).map((e, idx) => (
                    <div
                        key={`${e.tradeTime}-${idx}`}
                        style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            fontSize: '11px',
                            color: 'var(--black-text-secondary)',
                            opacity: 1 - idx * 0.06,
                            animation: idx === 0 ? 'slideDown 0.2s ease-out' : 'none',
                        }}
                    >
                        <span style={{ color: 'var(--black-short)' }}>LONG LIQ</span>
                        <span>{formatValue(e.price, e.quantity)}</span>
                    </div>
                ))}
            </div>

            <div
                style={{
                    borderTop: '1px solid var(--black-border)',
                    paddingTop: '8px',
                    marginTop: '6px',
                    textAlign: 'right',
                }}
            >
                {/*<div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.35)', marginBottom: '2px' }}>누계</div>*/}
                <div style={{ fontSize: '22px', fontWeight: '700', color: 'var(--black-short)', fontFamily: "'Pretendard', sans-serif" }}>
                    ${formatTotal(total)}
                </div>
            </div>

            <style>{`
                @keyframes slideDown {
                    from { transform: translateY(-8px); opacity: 0; }
                    to   { transform: translateY(0);    opacity: 1; }
                }
            `}</style>
        </div>
    );
}
