export function formatUsdtRateLabel(usdtTicker) {
    return usdtTicker
        ? '1 USDT = ₩' + Math.round(usdtTicker.trade_price).toLocaleString('ko-KR')
        : '1 USDT = ...';
}
