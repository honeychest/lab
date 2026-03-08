// [AGENT] SSE 훅 — 실시간 BTC 체결 수신, 재연결, 초기 100건 로드, 모바일 무한스크롤
// 연관파일: TradePage.jsx, /api/binance/trades/sse, /api/binance/trades/recent
// 주요상태: trades(목록), scanState(스캔슬롯 애니메이션), initError(초기 로드 실패)
import { useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';

export interface TradeEntry {
    id: number;
    symbol: string;
    marketType: 'SPOT' | 'FUTURES';
    price: string;
    quantity: string;
    tradeValue: string;
    isBuyerMaker: boolean;
    tradedAt: number;
}

export type ScanState = 'watching' | 'expanding' | 'reconnecting';

const DESKTOP_MAX = 100;
const RECONNECT_DELAY_MS = 1_000;
const ANIMATION_MS = 500;

export function useBinanceTradeSse() {
    const [trades, setTrades] = useState<TradeEntry[]>([]);
    const [scanState, setScanState] = useState<ScanState>('watching');
    const [initError, setInitError] = useState(false);

    const isMobileRef = useRef(typeof window !== 'undefined' && window.innerWidth <= 768);
    const seenIds = useRef(new Set<number>());
    const esRef = useRef<EventSource | null>(null);
    const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const isAnimatingRef = useRef(false);

    useEffect(() => {
        let closed = false;
        seenIds.current.clear();

        const loadRecent = async () => {
            const tag = '[SSE loadRecent]';
            try {
                console.log(tag, 'start');
                const res = await axios.get<TradeEntry[]>('/api/binance/trades/recent?limit=100');
                if (closed) return;
                const incoming = res.data;
                console.log(tag, 'ok', incoming.length, 'rows');
                incoming.forEach(t => seenIds.current.add(t.id));
                setTrades(current => {
                    const existingIds = new Set(current.map(t => t.id));
                    const newOnes = incoming.filter(t => !existingIds.has(t.id));
                    const merged = [...newOnes, ...current].sort((a, b) => b.id - a.id);
                    return isMobileRef.current ? merged : merged.slice(0, DESKTOP_MAX);
                });
                setInitError(false);
            } catch (err) {
                console.warn(tag, 'fail', err);
                if (!closed) setInitError(true);
            }
        };

        const connect = () => {
            if (closed) return;
            if (esRef.current) {
                esRef.current.close();
                esRef.current = null;
            }

            console.log('[SSE connect] new EventSource');
            const es = new EventSource('/api/binance/trades/sse');
            esRef.current = es;

            es.addEventListener('open', () => {
                if (closed) return;
                console.log('[SSE connect] open');
                setScanState('watching');
            });

            es.addEventListener('trade', (e: MessageEvent) => {
                if (closed) return;
                try {
                    const trade: TradeEntry = JSON.parse(e.data);
                    if (seenIds.current.has(trade.id)) return;
                    seenIds.current.add(trade.id);
                    console.log('[SSE trade]', trade.id, trade.tradeValue);

                    // 애니메이션 중 새 체결 → 즉시 삽입 (애니메이션 스킵)
                    if (isAnimatingRef.current) {
                        setTrades(prev => {
                            const next = [trade, ...prev];
                            return isMobileRef.current ? next : next.slice(0, DESKTOP_MAX);
                        });
                        return;
                    }

                    isAnimatingRef.current = true;
                    setScanState('expanding');
                    setTimeout(() => {
                        if (closed) return;
                        setTrades(prev => {
                            const next = [trade, ...prev];
                            return isMobileRef.current ? next : next.slice(0, DESKTOP_MAX);
                        });
                        setScanState('watching');
                        isAnimatingRef.current = false;
                    }, ANIMATION_MS);
                } catch {
                    // ignore parse error
                }
            });

            es.onerror = () => {
                if (closed) return;
                console.warn('[SSE connect] error, readyState=', es.readyState);
                es.close();
                esRef.current = null;
                setScanState('reconnecting');
                isAnimatingRef.current = false;
                reconnectTimerRef.current = setTimeout(() => {
                    if (!closed) {
                        console.log('[SSE connect] reconnect after delay');
                        connect();
                        loadRecent();
                    }
                }, RECONNECT_DELAY_MS);
            };
        };

        const handleVisibilityChange = () => {
            if (document.hidden) return;
            console.log('[SSE visibility] tab visible, reconnecting');
            // 탭이 다시 활성화되면 기존 연결 종료 후 재연결 + 최신 목록 머지(loadRecent 유지)
            if (reconnectTimerRef.current) {
                clearTimeout(reconnectTimerRef.current);
                reconnectTimerRef.current = null;
            }
            if (esRef.current) {
                esRef.current.close();
                esRef.current = null;
            }
            if (!closed) {
                setScanState('reconnecting');
                isAnimatingRef.current = false;
                connect();
                loadRecent();
            }
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);

        connect();
        loadRecent();

        return () => {
            closed = true;
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            esRef.current?.close();
            esRef.current = null;
            if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
        };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    /** 모바일 무한스크롤 — before-id 기반 추가 로드 */
    const loadMore = useCallback(async (beforeId: number, limit = 20): Promise<TradeEntry[]> => {
        const res = await axios.get<TradeEntry[]>(
            `/api/binance/trades/recent?before=${beforeId}&limit=${limit}`
        );
        const incoming = res.data;
        setTrades(current => {
            const existingIds = new Set(current.map(t => t.id));
            const newOnes = incoming.filter(t => !existingIds.has(t.id));
            return [...current, ...newOnes];
        });
        return incoming;
    }, []);

    return { trades, scanState, initError, loadMore };
}
