// [AGENT] SSE 훅 — Signal Dashboard 실시간 데이터 수신 (aggtrade, forceOrder, oi)
// 연관파일: SignalPage.jsx, /api/signal/stream/sse
import { useCallback, useEffect, useRef, useState } from 'react';

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
const AGG_TRADE_QUEUE_MAX = 1_000;
const FORCE_ORDER_QUEUE_MAX = 100;

export function useSignalSse({ symbol }: UseSignalSseParams) {
    const [latestOi, setLatestOi] = useState<OiEvent | null>(null);
    const [connected, setConnected] = useState(false);
    const [aggTradeVersion, setAggTradeVersion] = useState(0);
    const [forceOrderVersion, setForceOrderVersion] = useState(0);

    const aggTradeQueueRef = useRef<AggTradeEvent[]>([]);
    const forceOrderQueueRef = useRef<ForceOrderEvent[]>([]);
    const esRef = useRef<EventSource | null>(null);
    const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const symbolDebounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const drainAggTrades = useCallback(() => {
        const queued = aggTradeQueueRef.current;
        aggTradeQueueRef.current = [];
        return queued;
    }, []);

    const drainForceOrders = useCallback(() => {
        const queued = forceOrderQueueRef.current;
        forceOrderQueueRef.current = [];
        return queued;
    }, []);

    useEffect(() => {
        let closed = false;

        if (symbolDebounceTimerRef.current) {
            clearTimeout(symbolDebounceTimerRef.current);
        }

        symbolDebounceTimerRef.current = setTimeout(() => {
            if (closed) return;

            aggTradeQueueRef.current = [];
            forceOrderQueueRef.current = [];
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
                        const queue = aggTradeQueueRef.current;
                        queue.push(trade);
                        if (queue.length > AGG_TRADE_QUEUE_MAX) queue.shift();
                        setAggTradeVersion(prev => prev + 1);
                    } catch {
                        // ignore parse error
                    }
                });

                es.addEventListener('forceOrder', (e: MessageEvent) => {
                    if (closed) return;
                    try {
                        const order: ForceOrderEvent = JSON.parse(e.data);
                        const queue = forceOrderQueueRef.current;
                        queue.push(order);
                        if (queue.length > FORCE_ORDER_QUEUE_MAX) queue.shift();
                        setForceOrderVersion(prev => prev + 1);
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
                aggTradeQueueRef.current = [];
                forceOrderQueueRef.current = [];
                if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
            };
        }, SYMBOL_CHANGE_DEBOUNCE_MS);

        return () => {
            closed = true;
            if (symbolDebounceTimerRef.current) clearTimeout(symbolDebounceTimerRef.current);
        };
    }, [symbol]);

    return {
        latestOi,
        connected,
        aggTradeVersion,
        forceOrderVersion,
        drainAggTrades,
        drainForceOrders,
    };
}
