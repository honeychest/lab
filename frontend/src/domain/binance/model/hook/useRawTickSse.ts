// [AGENT] 실시간 틱 SSE 훅 — /api/binance/trades/tick-sse, 100ms 배치·100건 캡, 재연결 시 ticks 초기화
// 연관파일: TradePage.jsx, TickTable.tsx
import { useEffect, useRef, useState } from 'react';

export interface RawTickEntry {
    price: string;
    quantity: string;
    isBuyerMaker: boolean;
    marketType: string;
}

const QUEUE_MAX = 1000;
const TICKS_MAX = 100;
const BATCH_MS = 100;
const RECONNECT_DELAY_MS = 1_000;

export function useRawTickSse() {
    const [ticks, setTicks] = useState<RawTickEntry[]>([]);
    const [isConnecting, setIsConnecting] = useState(true);

    const queueRef = useRef<RawTickEntry[]>([]);
    const esRef = useRef<EventSource | null>(null);
    const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const hasReceivedTickRef = useRef(false);

    useEffect(() => {
        let closed = false;

        const connect = () => {
            if (closed) return;
            if (esRef.current) {
                esRef.current.close();
                esRef.current = null;
            }

            setIsConnecting(true);
            setTicks([]);
            queueRef.current = [];
            hasReceivedTickRef.current = false;

            const es = new EventSource('/api/binance/trades/tick-sse');
            esRef.current = es;

            es.addEventListener('tick', (e: MessageEvent) => {
                if (closed) return;
                try {
                    const tick: RawTickEntry = JSON.parse(e.data);
                    const p = parseFloat(tick.price);
                    const qty = parseFloat(tick.quantity);
                    if (p === 0 || qty === 0 || Number.isNaN(p) || Number.isNaN(qty)) {
                        console.warn('[RawTickSse] 틱 0/비정상 수신', { price: tick.price, quantity: tick.quantity, marketType: tick.marketType });
                    }
                    const q = queueRef.current;
                    q.push(tick);
                    if (q.length > QUEUE_MAX) q.shift();
                    if (!hasReceivedTickRef.current) {
                        hasReceivedTickRef.current = true;
                        setIsConnecting(false);
                    }
                } catch {
                    // ignore parse error
                }
            });

            es.onerror = () => {
                if (closed) return;
                es.close();
                esRef.current = null;
                setIsConnecting(true);
                setTicks([]);
                queueRef.current = [];
                reconnectTimerRef.current = setTimeout(() => {
                    if (!closed) connect();
                }, RECONNECT_DELAY_MS);
            };
        };

        const reconnectOnVisible = () => {
            if (closed) return;
            if (reconnectTimerRef.current) {
                clearTimeout(reconnectTimerRef.current);
                reconnectTimerRef.current = null;
            }
            if (esRef.current) {
                esRef.current.close();
                esRef.current = null;
            }
            setIsConnecting(true);
            setTicks([]);
            queueRef.current = [];
            hasReceivedTickRef.current = false;
            connect();
        };

        const handleVisibilityChange = () => {
            if (document.hidden) return;
            reconnectOnVisible();
        };

        const handlePageShow = (e: PageTransitionEvent) => {
            if (e.persisted) reconnectOnVisible();
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);
        window.addEventListener('pageshow', handlePageShow);

        const intervalId = setInterval(() => {
            if (closed) return;
            const q = queueRef.current;
            if (q.length === 0) return;
            const batch = q.splice(0, q.length);
            setTicks(prev => {
                const next = [...batch, ...prev].slice(0, TICKS_MAX);
                return next;
            });
        }, BATCH_MS);

        connect();

        return () => {
            closed = true;
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            window.removeEventListener('pageshow', handlePageShow);
            clearInterval(intervalId);
            esRef.current?.close();
            esRef.current = null;
            if (reconnectTimerRef.current) {
                clearTimeout(reconnectTimerRef.current);
                reconnectTimerRef.current = null;
            }
        };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    return { ticks, isConnecting };
}
