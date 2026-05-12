import { useEffect, useRef, useState } from 'react';
import { initialTickState, reduceTickState } from '../tickAccumulation.js';

// Returns cumulative buy/sell BTC volume from a live tick stream.
// Resets to zero whenever the SSE is reconnecting.
export function useTickTotals(ticks, isReconnecting) {
    const stateRef = useRef(initialTickState());
    const [totals, setTotals] = useState(() => initialTickState().totals);

    useEffect(() => {
        const next = reduceTickState(stateRef.current, { ticks, isReconnecting });
        stateRef.current = next;
        setTotals(next.totals);
    }, [ticks, isReconnecting]);

    return totals;
}
