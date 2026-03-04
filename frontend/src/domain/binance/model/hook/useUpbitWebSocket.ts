// Purpose: 업비트 KRW 티커 WebSocket 연결을 관리하고 여러 코드의 trade_price를 실시간으로 반환

import { useEffect, useRef, useState } from 'react';

/**
 * 업비트 티커에서 화면에 바로 필요한 핵심 필드만 추린 타입.
 * trade_price = KRW 현재가, code = 마켓 코드 (예: KRW-BTC)
 */
export interface UpbitTicker {
    code: string;
    trade_price: number;
    signed_change_rate?: number;
    high_price?: number;
    low_price?: number;
}

/**
 * 화면 인디케이터용 WebSocket 상태 타입.
 */
export type UpbitWsStatus = 'connecting' | 'connected' | 'disconnected';

/**
 * 훅 반환 타입.
 */
export interface UseUpbitWebSocketResult {
    tickers: Record<string, UpbitTicker>;
    upbitStatus: UpbitWsStatus;
}

/**
 * 업비트 WebSocket raw payload의 최소 구조.
 * 실제 필드는 더 많지만, 화면에서 쓰는 핵심만 명시.
 */
interface UpbitTickerPayload {
    type?: string;
    code?: string;
    trade_price?: number;
    signed_change_rate?: number;
    high_price?: number;
    low_price?: number;
}

/**
 * 업비트 소켓 메시지는 브라우저 환경에 따라 string/ArrayBuffer/Blob으로 올 수 있어서
 * 타입별로 안전하게 문자열로 변환 후 JSON.parse 처리한다.
 */
async function parseUpbitPayload(data: unknown): Promise<UpbitTickerPayload | null> {
    try {
        if (typeof data === 'string') {
            return JSON.parse(data) as UpbitTickerPayload;
        }

        if (data instanceof ArrayBuffer) {
            const text = new TextDecoder('utf-8').decode(data);
            return JSON.parse(text) as UpbitTickerPayload;
        }

        if (data instanceof Blob) {
            const text = await data.text();
            return JSON.parse(text) as UpbitTickerPayload;
        }
    } catch {
        return null;
    }

    return null;
}

/**
 * useUpbitWebSocket
 *
 * @param codes 업비트 마켓 코드 배열 (예: ['KRW-BTC', 'KRW-USDT']).
 *              배열이 비어있으면 연결하지 않음.
 *
 * 동작 요약:
 * 1) 백엔드 업비트 중계 WS(/ws/upbit-price)에 연결
 * 2) 수신 데이터에서 code별 trade_price(KRW 현재가) 추출
 * 3) 예기치 않은 종료 시 3초 후 자동 재연결
 * 4) 탭 비활성화(document.hidden=true) 시 소켓 종료, 다시 활성화되면 재연결
 * 5) codes 변경 시 기존 연결 정리 후 새 코드 배열로 재연결
 *
 * 참고:
 * 브라우저에서 업비트로 직접 연결하면 Origin 기반 제한 영향이 커질 수 있어,
 * 서버 중계 경로를 통해 단일 상위 소켓으로 구독하도록 전환했다.
 */
export function useUpbitWebSocket(codes: string[]): UseUpbitWebSocketResult {
    const [tickers, setTickers] = useState<Record<string, UpbitTicker>>({});
    const [upbitStatus, setUpbitStatus] = useState<UpbitWsStatus>('disconnected');

    const wsRef = useRef<WebSocket | null>(null);
    const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const isManualCloseRef = useRef<boolean>(false);

    useEffect(() => {
        // 빈 문자열/중복 코드를 제거해서 실제 구독에 사용할 코드 목록을 정규화.
        const normalizedCodes = Array.from(
            new Set(codes.filter((code) => typeof code === 'string' && code.trim().length > 0)),
        );
        const codeSet = new Set(normalizedCodes);

        // 코드 목록 변경 시 이전 수신값을 비워서 스켈레톤이 보이도록 처리.
        setTickers({});
        isManualCloseRef.current = false;

        const connect = () => {
            // 구독 코드가 없으면 연결하지 않고 disconnected 상태 유지.
            if (normalizedCodes.length === 0) {
                setUpbitStatus('disconnected');
                return;
            }

            // 중복 연결 방지.
            const state = wsRef.current?.readyState;
            if (state === WebSocket.CONNECTING || state === WebSocket.OPEN) return;

            setUpbitStatus('connecting');

            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            const host = window.location.host;
            const encodedCodes = encodeURIComponent(normalizedCodes.join(','));
            const url = `${protocol}//${host}/ws/upbit-price?codes=${encodedCodes}`;

            const ws = new WebSocket(url);
            ws.binaryType = 'arraybuffer';

            ws.onopen = () => {
                setUpbitStatus('connected');
            };

            ws.onmessage = async (event: MessageEvent) => {
                const payload = await parseUpbitPayload(event.data);
                if (!payload) return;
                if (payload.type !== 'ticker') return;
                if (typeof payload.trade_price !== 'number') return;
                if (typeof payload.code !== 'string') return;
                const code = payload.code;
                const tradePrice = payload.trade_price;
                if (!codeSet.has(code)) return;

                setTickers((prev) => ({
                    ...prev,
                    [code]: {
                        code,
                        trade_price: tradePrice,
                        signed_change_rate: payload.signed_change_rate,
                        high_price: payload.high_price,
                        low_price: payload.low_price,
                    },
                }));
            };

            ws.onclose = () => {
                setUpbitStatus('disconnected');
                if (!isManualCloseRef.current) {
                    reconnectTimerRef.current = setTimeout(connect, 3000);
                }
            };

            ws.onerror = () => {
                ws.close();
            };

            wsRef.current = ws;
        };

        // codes가 비어있으면 연결하지 않고 종료.
        if (normalizedCodes.length === 0) {
            setUpbitStatus('disconnected');
            return;
        }

        connect();

        const handleVisibilityChange = () => {
            if (document.hidden) {
                isManualCloseRef.current = true;
                if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
                wsRef.current?.close();
                setUpbitStatus('disconnected');
            } else {
                isManualCloseRef.current = false;
                connect();
            }
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            isManualCloseRef.current = true;
            if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
            wsRef.current?.close();
        };
    }, [codes]);

    return { tickers, upbitStatus };
}
