const STATUS_CONFIG = {
    connected: { color: '#2ecc71', text: 'LIVE' },
    connecting: { color: '#f39c12', text: '연결 중...' },
    disconnected: { color: '#e74c3c', text: '연결 끊김' },
};

export function buildBinanceLiveStatus({
    status,
    ticker,
    prefersReducedMotion,
}) {
    const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.disconnected;
    const connected = status === 'connected';

    return {
        color: config.color,
        text: config.text,
        fill: connected ? config.color : 'transparent',
        blink: connected && ticker != null && !prefersReducedMotion,
        transition: prefersReducedMotion ? 'none' : 'background-color 0.15s ease-out',
    };
}
