// [AGENT] SSE 훅 — Signal Dashboard 실시간 데이터 수신 (aggtrade, forceOrder, oi)
// 연관파일: SignalPage.jsx, /api/signal/stream/sse
import { useEffect, useRef, useState } from 'react';

export interface AggTradeEvent {
    symbol: string;
    marketType: 'SPOT' | 'FUTURES';
    price: string;
    quantity: string;
    isBuyerMaker: boolean;
    tradedAt: number;
}

export interface ForceOrderEvent {
    symbol: string;
    side: 'BUY' | 'SELL';
    price: string;
    quantity: string;
    tradeTime: number;
}

export interface OiEvent {
    symbol: string;
    openInterest: string;
    collectedAt: string;
}

interface UseSignalSseParams {
    symbol: string;
}

const RECONNECT_DELAY_MS = 1_000;
const SYMBOL_CHANGE_DEBOUNCE_MS = 300;

export function useSignalSse({ symbol }: UseSignalSseParams) {
    const [aggTrades, setAggTrades] = useState<AggTradeEvent[]>([]);
    const [forceOrders, setForceOrders] = useState<ForceOrderEvent[]>([]);
    const [latestOi, setLatestOi] = useState<OiEvent | null>(null);
    const [connected, setConnected] = useState(false);

    const esRef = useRef<EventSource | null>(null);
    const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const symbolDebounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        let closed = false;

        if (symbolDebounceTimerRef.current) {
            clearTimeout(symbolDebounceTimerRef.current);
        }

        symbolDebounceTimerRef.current = setTimeout(() => {
            if (closed) return;

            setAggTrades([]);
            setForceOrders([]);
            setLatestOi(null);
            setConnected(false);

            const connect = () => {
                if (closed) return;
                if (esRef.current) {
                    esRef.current.close();
                    esRef.current = null;
                }

                console.log('[SignalSSE] connect() symbol=', symbol);
                const es = new EventSource(`/api/signal/stream/sse?symbol=${symbol}`);
                esRef.current = es;

                es.addEventListener('open', () => {
                    if (closed) return;
                    console.log('[SignalSSE] open');
                    setConnected(true);
                });

                es.addEventListener('aggtrade', (e: MessageEvent) => {
                    if (closed) return;
                    try {
                        const trade: AggTradeEvent = JSON.parse(e.data);
                        setAggTrades(prev => [trade, ...prev].slice(0, 100));
                    } catch {
                        // ignore parse error
                    }
                });

                es.addEventListener('forceOrder', (e: MessageEvent) => {
                    if (closed) return;
                    try {
                        const order: ForceOrderEvent = JSON.parse(e.data);
                        setForceOrders(prev => [order, ...prev].slice(0, 50));
                    } catch {
                        // ignore parse error
                    }
                });

                es.addEventListener('oi', (e: MessageEvent) => {
                    if (closed) return;
                    try {
                        const oi: OiEvent = JSON.parse(e.data);
                        setLatestOi(oi);
                    } catch {
                        // ignore parse error
                    }
                });

                es.onerror = () => {
                    if (closed) return;
                    console.warn('[SignalSSE] error, readyState=', es.readyState);
                    es.close();
                    esRef.current = null;
                    setConnected(false);
                    reconnectTimerRef.current = setTimeout(() => {
                        if (!closed) {
                            console.log('[SignalSSE] reconnect after delay');
                            connect();
                        }
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
                setConnected(false);
                connect();
            };

            const handleVisibilityChange = () => {
                console.log('[SignalSSE] visibilitychange, hidden=', document.hidden);
                if (document.hidden) return;
                reconnectOnVisible();
            };

            const handlePageShow = (e: PageTransitionEvent) => {
                console.log('[SignalSSE] pageshow, persisted=', e.persisted);
                if (e.persisted) reconnectOnVisible();
            };

            document.addEventListener('visibilitychange', handleVisibilityChange);
            window.addEventListener('pageshow', handlePageShow);

            connect();

            return () => {
                closed = true;
                console.log('[SignalSSE] unmount');
                document.removeEventListener('visibilitychange', handleVisibilityChange);
                window.removeEventListener('pageshow', handlePageShow);
                esRef.current?.close();
                esRef.current = null;
                if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
            };
        }, SYMBOL_CHANGE_DEBOUNCE_MS);

        return () => {
            closed = true;
            if (symbolDebounceTimerRef.current) clearTimeout(symbolDebounceTimerRef.current);
        };
    }, [symbol]);

    return { aggTrades, forceOrders, latestOi, connected };
}
