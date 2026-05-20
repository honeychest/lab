// [AGENT] /ws/monitor WebSocket 연결 훅 (5초 스냅샷 수신)
import { useEffect, useRef, useState } from 'react';
import apiClient from '@/api/apiClient.js';

export function useMonitorWebSocket() {
    const [snapshot, setSnapshot] = useState(null);
    const wsRef = useRef(null);
    const retryRef = useRef(null);

    useEffect(() => {
        const connect = () => {
            const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
            const url = `${protocol}://${window.location.host}/ws/monitor`;
            const ws = new WebSocket(url);
            wsRef.current = ws;

            ws.onmessage = (e) => {
                try {
                    const data = JSON.parse(e.data);
                    setSnapshot(data);
                } catch {
                    // ignore
                }
            };

            ws.onclose = () => {
                retryRef.current = window.setTimeout(connect, 2000);
            };
        };
        apiClient.get('/api/monitor/snapshot')
            .then(res => {
                if (res.data) setSnapshot(res.data);
            })
            .catch(() => {});
        connect();

        return () => {
            if (retryRef.current) window.clearTimeout(retryRef.current);
            if (wsRef.current) wsRef.current.close();
        };
    }, []);

    return { snapshot };
}
