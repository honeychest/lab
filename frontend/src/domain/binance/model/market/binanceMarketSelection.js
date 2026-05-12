export const BINANCE_MARKETS = [
    { symbol: 'BTCUSDT', code: 'BTC', label: 'BTC / USDT', upbitCode: 'KRW-BTC' },
    { symbol: 'ETHUSDT', code: 'ETH', label: 'ETH / USDT', upbitCode: 'KRW-ETH' },
    { symbol: 'SOLUSDT', code: 'SOL', label: 'SOL / USDT', upbitCode: 'KRW-SOL' },
    { symbol: 'XRPUSDT', code: 'XRP', label: 'XRP / USDT', upbitCode: 'KRW-XRP' },
];

export function getSelectedBinanceMarket(symbol) {
    return BINANCE_MARKETS.find((market) => market.symbol === symbol) ?? BINANCE_MARKETS[0];
}

export function getUpbitSubscriptionCodes(market) {
    return market.upbitCode
        ? [market.upbitCode, 'KRW-USDT']
        : ['KRW-USDT'];
}
