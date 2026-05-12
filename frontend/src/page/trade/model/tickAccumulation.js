// Pure reducer: accumulates buy/sell BTC volume across the lifetime of the page.
// Reference identity on tick objects determines "new" (matches original behavior).
//
// state: { totals: {buy, sell}, prevTicks }
// input: { ticks, isReconnecting }
// On reconnect, totals reset. Empty incoming ticks clear prevTicks but keep totals.
// Invalid quantities (NaN, non-finite, <=0) are skipped.
// isBuyerMaker=true → sell side; false → buy side.

export const initialTickState = () => ({
    totals: { buy: 0, sell: 0 },
    prevTicks: [],
});

export function reduceTickState(state, { ticks, isReconnecting }) {
    if (isReconnecting) return initialTickState();
    if (ticks.length === 0) {
        return { totals: state.totals, prevTicks: [] };
    }

    const prev = state.prevTicks;
    const added = ticks.filter(t => !prev.includes(t));
    if (added.length === 0) {
        return { totals: state.totals, prevTicks: ticks };
    }

    let buyDelta = 0;
    let sellDelta = 0;
    for (const t of added) {
        const qty = parseFloat(t.quantity ?? '0');
        if (!Number.isFinite(qty) || qty <= 0) continue;
        if (t.isBuyerMaker) sellDelta += qty;
        else buyDelta += qty;
    }

    if (buyDelta === 0 && sellDelta === 0) {
        return { totals: state.totals, prevTicks: ticks };
    }

    return {
        totals: {
            buy: state.totals.buy + buyDelta,
            sell: state.totals.sell + sellDelta,
        },
        prevTicks: ticks,
    };
}
