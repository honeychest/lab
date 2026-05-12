export const getTradeSymbol = (trades) =>
    trades?.[0]?.symbol?.replace('USDT', '') ?? 'BTC';

export const getScanSlotView = (scanState) => {
    const isExpanding = scanState === 'expanding';
    const isReconnecting = scanState === 'reconnecting';

    if (isReconnecting) {
        return {
            isExpanding,
            isReconnecting,
            label: '재연결 중...',
            showThreshold: false,
            showBeam: false,
        };
    }

    return {
        isExpanding,
        isReconnecting,
        label: isExpanding ? '● 체결 감지' : '○ 감시중',
        showThreshold: !isExpanding,
        showBeam: !isExpanding,
    };
};
