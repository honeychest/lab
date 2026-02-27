// Purpose: 업비트 KRW 티커 WebSocket 연결을 관리하고 trade_price를 실시간으로 반환

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
    upbitTicker: UpbitTicker | null;
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
 * @param upbitCode 업비트 마켓 코드 (예: KRW-BTC, KRW-ETH). null이면 연결하지 않음.
 *
 * 동작 요약:
 * 1) 연결 성공 시 업비트 구독 메시지를 전송
 * 2) 수신 데이터에서 trade_price(KRW 현재가) 추출
 * 3) 예기치 않은 종료 시 3초 후 자동 재연결
 * 4) 탭 비활성화(document.hidden=true) 시 소켓 종료, 다시 활성화되면 재연결
 * 5) upbitCode 변경 시 기존 연결 정리 후 새 코드로 재연결
 */
export function useUpbitWebSocket(upbitCode: string | null): UseUpbitWebSocketResult {
    const [upbitTicker, setUpbitTicker] = useState<UpbitTicker | null>(null);
    const [upbitStatus, setUpbitStatus] = useState<UpbitWsStatus>('disconnected');

    const wsRef = useRef<WebSocket | null>(null);
    const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const isManualCloseRef = useRef<boolean>(false);

    const connect = () => {
        // 업비트 코드가 없으면 "미상장" 케이스이므로 연결하지 않고 null 유지.
        if (!upbitCode) {
            setUpbitTicker(null);
            setUpbitStatus('disconnected');
            return;
        }

        // 중복 연결 방지.
        const state = wsRef.current?.readyState;
        if (state === WebSocket.CONNECTING || state === WebSocket.OPEN) return;

        setUpbitStatus('connecting');

        const ws = new WebSocket('wss://api.upbit.com/websocket/v1');
        ws.binaryType = 'arraybuffer';

        ws.onopen = () => {
            setUpbitStatus('connected');

            // 업비트 구독 메시지: ticket + ticker + codes
            ws.send(
                JSON.stringify([
                    { ticket: 'upbit-ticker' },
                    { type: 'ticker', codes: [upbitCode] },
                ]),
            );
        };

        ws.onmessage = async (event: MessageEvent) => {
            const payload = await parseUpbitPayload(event.data);
            if (!payload) return;
            if (payload.type !== 'ticker') return;
            if (typeof payload.trade_price !== 'number') return;
            if (!payload.code) return;

            setUpbitTicker({
                code: payload.code,
                trade_price: payload.trade_price,
                signed_change_rate: payload.signed_change_rate,
                high_price: payload.high_price,
                low_price: payload.low_price,
            });
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

    useEffect(() => {
        // 코인 전환 시 이전 코인 KRW 값을 잠깐 비워서 스켈레톤이 보이도록 처리.
        setUpbitTicker(null);
        isManualCloseRef.current = false;

        // upbitCode가 null이면 연결 없이 종료.
        if (!upbitCode) {
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
    }, [upbitCode]);

    return { upbitTicker, upbitStatus };
}

