// Pure display formatters for the Trade page.
// No React, no DOM, no network — only data → string.

export const USD_KRW_RATE = 1450;

const commaInt = (n) => {
    const x = Number(n);
    if (!Number.isFinite(x)) return '';
    return x.toLocaleString('en-US', { maximumFractionDigits: 0 });
};

export const formatThreshold = (v) => {
    if (v == null) return '...';
    const n = Number(v);
    return `${commaInt(n)} / ${commaInt(Math.round(n / 2))} USD`;
};

export const formatTime = (tradedAt) =>
    new Date(tradedAt).toLocaleTimeString('ko-KR', {
        timeZone: 'Asia/Seoul',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
    });

export const formatPrice = (v) =>
    parseFloat(v).toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });

export const formatQty = (v) => (v != null ? parseFloat(v).toFixed(4) : '—');

export const formatValue = (v) => {
    const n = parseFloat(v);
    if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
    return `$${(n / 1_000).toFixed(0)}K`;
};

export const getElapsed = (tradedAt, now = Date.now()) => {
    const diffMin = Math.floor((now - tradedAt) / 60_000);
    if (diffMin < 1) return '방금';
    if (diffMin < 60) return `${diffMin}분 전`;
    const diffHour = Math.floor(diffMin / 60);
    if (diffHour < 24) return `${diffHour}시간 전`;
    return `${Math.floor(diffHour / 24)}일 전`;
};

export const formatKrw = (usdValue) => {
    const krw = Math.round(parseFloat(usdValue) * USD_KRW_RATE);
    return `${commaInt(krw)}원`;
};

export const formatTickQtyTotal = (v) => v.toFixed(4);
