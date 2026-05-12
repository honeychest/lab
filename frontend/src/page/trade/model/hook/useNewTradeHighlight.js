import { useEffect, useRef, useState } from 'react';
import { detectNewFirstId, HIGHLIGHT_DURATION_MS } from '../newTradeHighlight.js';

// Tracks which trade ids should briefly render as "new" (skeleton shimmer).
// Cleans up pending timers on unmount to avoid setState-after-unmount warnings.
export function useNewTradeHighlight(firstId, durationMs = HIGHLIGHT_DURATION_MS) {
    const [newIds, setNewIds] = useState(() => new Set());
    const prevFirstIdRef = useRef(null);
    const timersRef = useRef(new Map());

    useEffect(() => {
        const detected = detectNewFirstId(prevFirstIdRef.current, firstId);
        prevFirstIdRef.current = firstId;
        if (detected == null) return;

        setNewIds(prev => {
            const next = new Set(prev);
            next.add(detected);
            return next;
        });

        const timerId = setTimeout(() => {
            timersRef.current.delete(detected);
            setNewIds(prev => {
                const next = new Set(prev);
                next.delete(detected);
                return next;
            });
        }, durationMs);
        timersRef.current.set(detected, timerId);
    }, [firstId, durationMs]);

    useEffect(() => {
        const timers = timersRef.current;
        return () => {
            for (const t of timers.values()) clearTimeout(t);
            timers.clear();
        };
    }, []);

    return newIds;
}
