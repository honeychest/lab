// [AGENT] TASK-10: DivergenceBar — 가격-Delta 다이버전스 표시 바
// 규칙: height 28px 고정 항상 예약, 미발생 시 visibility:hidden (display:none 금지)
// BEARISH: rgba(255,160,50,0.9) | BULLISH: rgba(80,160,255,0.9)
// 클라이언트 계산: candleHistory + timeRange 기준 window 슬라이싱 → divergence 산출

const BEARISH_COLOR = 'rgba(255,160,50,0.9)';
const BULLISH_COLOR = 'rgba(80,160,255,0.9)';

function calcDivergence(candleHistory, rangeMs) {
    if (!candleHistory || candleHistory.length === 0) return null;

    const now      = Date.now();
    const filtered = candleHistory.filter((c) => c.time >= now - rangeMs);
    if (filtered.length < 2) return null;

    const firstOpen  = filtered[0].open;
    const lastClose  = filtered[filtered.length - 1].close;
    const totalDelta = filtered.reduce((sum, c) => sum + (c.delta ?? 0), 0);

    const priceDir = lastClose >= firstOpen ? 'UP' : 'DOWN';
    const deltaDir = totalDelta >= 0 ? 'BUY' : 'SELL';

    const divergence = !(priceDir === 'UP' && deltaDir === 'BUY') &&
                       !(priceDir === 'DOWN' && deltaDir === 'SELL');
    if (!divergence) return { divergence: false };

    const divergenceType = priceDir === 'UP' ? 'BEARISH' : 'BULLISH';

    let efficiency = null;
    if (firstOpen !== 0) {
        const priceChangePct = Math.abs((lastClose - firstOpen) / firstOpen * 100);
        if (priceChangePct !== 0) {
            efficiency = Math.abs(totalDelta) / priceChangePct;
        }
    }

    return { divergence: true, divergence_type: divergenceType, efficiency };
}

export default function DivergenceBar({ candleHistory, rangeMs }) {
    const data = calcDivergence(candleHistory, rangeMs);

    const hasDivergence = data?.divergence === true;
    const type          = data?.divergence_type;
    const efficiency    = data?.efficiency;

    const color = type === 'BEARISH' ? BEARISH_COLOR : BULLISH_COLOR;

    const effStr = efficiency != null
        ? Number(efficiency).toLocaleString(undefined, { maximumFractionDigits: 1 })
        : '—';

    const text = type === 'BEARISH'
        ? `↑가격 ↓거래량 · 약세 다이버전스 · 효율성 ${effStr}`
        : `↓가격 ↑거래량 · 강세 다이버전스 · 효율성 ${effStr}`;

    return (
        <div
            style={{
                height: '28px',
                display: 'flex',
                alignItems: 'center',
                paddingLeft: '8px',
                visibility: hasDivergence ? 'visible' : 'hidden',
                flexShrink: 0,
            }}
        >
            <span
                style={{
                    fontSize: '11px',
                    fontWeight: '600',
                    color: hasDivergence ? color : 'transparent',
                    fontFamily: "'Pretendard', sans-serif",
                    letterSpacing: '0.3px',
                }}
            >
                {text}
            </span>
        </div>
    );
}
