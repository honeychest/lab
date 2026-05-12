export function buildBinanceTickerDisplayModel({
    ticker,
    upbitTicker,
    usdtKrwTicker,
}) {
    const currentPrice = parseFloat(ticker.c);
    const highPrice = parseFloat(ticker.h);
    const lowPrice = parseFloat(ticker.l);
    const changeRate = parseFloat(ticker.P);
    const isPositive = changeRate >= 0;
    const hasUpbitMarket = upbitTicker !== undefined;
    const hasUpbitData = upbitTicker !== undefined && upbitTicker !== null;
    const upbitTradePrice = upbitTicker?.trade_price ?? Number.NaN;
    const hasUsdtRate = usdtKrwTicker != null;
    const calcKrw = hasUsdtRate ? currentPrice * usdtKrwTicker.trade_price : null;
    const premium = hasUpbitData && calcKrw !== null ? upbitTradePrice - calcKrw : null;
    const premiumRate = premium !== null && calcKrw !== null ? (premium / calcKrw) * 100 : null;

    return {
        color: Number.isNaN(changeRate) ? '#ffffff' : isPositive ? '#2ecc71' : '#e74c3c',
        sign: isPositive ? '+' : '',
        currentPrice,
        highPrice,
        lowPrice,
        highDiffFromCurrent: highPrice - currentPrice,
        lowDiffFromCurrent: lowPrice - currentPrice,
        hasUpbitMarket,
        hasUpbitData,
        upbitTradePrice,
        calcKrw,
        premium,
        premiumRate,
        premiumColor: premium !== null ? (premium >= 0 ? '#2ecc71' : '#e74c3c') : 'var(--dark-text-secondary)',
        premiumSign: premium !== null && premium >= 0 ? '+' : '',
    };
}

export function formatBinancePrice(value, decimals = 2) {
    const num = parseFloat(value);
    if (Number.isNaN(num)) return '-';
    return '$' + num.toLocaleString('en-US', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
    });
}

export function formatKrwPrice(value) {
    if (Number.isNaN(value)) return '-';
    return '₩' + value.toLocaleString('ko-KR', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    });
}

export function formatUsdDiff(diff) {
    if (Number.isNaN(diff)) return '-';
    const sign = diff > 0 ? '+' : diff < 0 ? '-' : '';
    const abs = Math.abs(diff);
    return sign + '$' + abs.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
}

export function formatBinanceVolume(value) {
    const num = parseFloat(value);
    if (Number.isNaN(num)) return '-';
    return num.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }) + ' BTC';
}

export function formatPremiumKrwAbs(value) {
    const abs = Math.abs(value);
    if (Number.isNaN(abs)) return '-';
    return '₩' + abs.toLocaleString('ko-KR', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    });
}
