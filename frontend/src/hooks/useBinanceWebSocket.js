// Purpose: 바이낸스 실시간 시세 WebSocket 연결 — 가격 수신, 탭 비활성화 처리, 재연결 관리
import { useEffect, useRef, useState } from 'react';

export function useBinanceWebSocket() {
    const [ticker, setTicker] = useState(null);
    const [status, setStatus] = useState('connecting'); // 'connecting' | 'connected' | 'disconnected'
    const wsRef = useRef(null);
    const reconnectTimerRef = useRef(null);
    const isManualClose = useRef(false);

    const connect = () => {
        const state = wsRef.current?.readyState;
        // CONNECTING(0) 또는 OPEN(1) 상태이면 중복 생성 방지
        if (state === WebSocket.CONNECTING || state === WebSocket.OPEN) return;

        setStatus('connecting');
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const ws = new WebSocket(`${protocol}//${window.location.host}/ws/binance-price`);

        ws.onopen = () => {
            setStatus('connected');
        };

        ws.onmessage = (e) => {
            try { setTicker(JSON.parse(e.data)); } catch { /* 파싱 실패 무시 */ }
        };

        // 비정상 종료 시 3초 후 자동 재연결
        ws.onclose = () => {
            setStatus('disconnected');
            if (!isManualClose.current) {
                reconnectTimerRef.current = setTimeout(connect, 3000);
            }
        };

        // 오류 발생 시 close 유도 → onclose에서 재연결 처리
        ws.onerror = (e) => {
            console.error('[WS] 오류 발생:', e);
            ws.close();
        };

        wsRef.current = ws;
    };

    useEffect(() => {
        // React StrictMode 대응: 클린업 후 재마운트 시 isManualClose 초기화 필수
        isManualClose.current = false;
        connect();

        // Page Visibility API — 탭 비활성화 시 연결 종료, 활성화 시 재연결
        const handleVisibilityChange = () => {
            if (document.hidden) {
                isManualClose.current = true;
                clearTimeout(reconnectTimerRef.current);
                wsRef.current?.close();
                setStatus('disconnected');
            } else {
                isManualClose.current = false;
                connect();
            }
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);

        // 컴포넌트 언마운트 시 메모리 누수 방지 클린업
        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            isManualClose.current = true;
            clearTimeout(reconnectTimerRef.current);
            wsRef.current?.close();
        };
    }, []);

    return { ticker, status };
}
