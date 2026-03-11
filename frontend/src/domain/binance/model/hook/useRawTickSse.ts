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
const OUT_DELAY_MS = 180_000;

export function useRawTickSse() {
    const [ticks, setTicks] = useState<RawTickEntry[]>([]);
    const [isConnecting, setIsConnecting] = useState(true);

    const queueRef = useRef<RawTickEntry[]>([]);
    const esRef = useRef<EventSource | null>(null);
    const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const hasReceivedTickRef = useRef(false);
    const lastHiddenAtRef = useRef<number | null>(null);

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

        const reconnectNow = () => {
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
            if (document.hidden) {
                lastHiddenAtRef.current = Date.now();
                return;
            }
            // 다시 보이게 되었을 때, 1분 이상 숨겨져 있었다면 재연결·초기화
            const lastHiddenAt = lastHiddenAtRef.current;
            lastHiddenAtRef.current = null;
            if (lastHiddenAt != null) {
                const hiddenMs = Date.now() - lastHiddenAt;
                if (hiddenMs >= OUT_DELAY_MS) {
                    reconnectNow();
                }
            }
        };

        const handlePageShow = (e: PageTransitionEvent) => {
            // bfcache 에서 복원된 경우, 마지막 hidden 시점 기준 1분 이상 지났으면 재연결
            if (e.persisted) {
                const lastHiddenAt = lastHiddenAtRef.current;
                lastHiddenAtRef.current = null;
                if (lastHiddenAt != null) {
                    const hiddenMs = Date.now() - lastHiddenAt;
                    if (hiddenMs >= OUT_DELAY_MS) {
                        reconnectNow();
                    }
                }
            }
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
