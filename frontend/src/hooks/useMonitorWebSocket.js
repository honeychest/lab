// [AGENT] /ws/monitor WebSocket 연결 훅 (5초 스냅샷 수신)
import { useEffect, useRef, useState } from 'react';

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
        fetch('/api/admin/monitor/snapshot')
            .then(r => r.ok ? r.json() : null)
            .then(data => { if (data) setSnapshot(data); })
            .catch(() => {});
        connect();

        return () => {
            if (retryRef.current) window.clearTimeout(retryRef.current);
            if (wsRef.current) wsRef.current.close();
        };
    }, []);

    return { snapshot };
}

