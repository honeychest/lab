import { fromString } from './decimal.js';

const OPEN_STATUSES = new Set(['NEW', 'PARTIALLY_FILLED']);
const ORDER_FIELDS = [
    'orderId',
    'symbol',
    'side',
    'positionSide',
    'type',
    'timeInForce',
    'reduceOnly',
    'price',
    'origQty',
    'executedQty',
    'status',
];
const DECIMAL_FIELDS = new Set(['price', 'origQty', 'executedQty']);

export function chaseParamsOf(order, modifyId) {
    if (order?.type !== 'LIMIT') return { ok: false, reason: 'LIMIT 주문만 Chase할 수 있습니다' };
    if (!OPEN_STATUSES.has(order.status)) {
        return { ok: false, reason: '미체결 또는 부분 체결 주문만 Chase할 수 있습니다' };
    }

    let remaining;
    try {
        remaining = fromString(order.origQty) > fromString(order.executedQty);
    } catch {
        return { ok: false, reason: '주문 수량을 읽을 수 없습니다' };
    }
    if (!remaining) return { ok: false, reason: '남은 수량이 없습니다' };

    return {
        ok: true,
        params: {
            symbol: order.symbol,
            orderId: String(order.orderId),
            side: order.side,
            quantity: order.origQty,
            priceMatch: 'QUEUE',
            modifyId,
        },
    };
}

function trimFractionZeros(value) {
    const [intPart, fraction = ''] = value.split('.');
    const trimmed = fraction.replace(/0+$/, '');
    return trimmed ? `${intPart}.${trimmed}` : intPart;
}

function validDecimal(value) {
    return typeof value === 'string' && /^-?\d+(\.\d+)?$/.test(value);
}

export function formatPrice(price, decimals) {
    if (!validDecimal(price)) return price;
    if (!Number.isInteger(decimals) || decimals < 0) return trimFractionZeros(price);

    const [intPart, fraction = ''] = price.split('.');
    if (fraction.length > decimals && /[1-9]/.test(fraction.slice(decimals))) {
        return trimFractionZeros(price);
    }
    return trimFractionZeros(decimals === 0 ? intPart : `${intPart}.${fraction.slice(0, decimals)}`);
}

export function formatQuantity(qty) {
    if (!validDecimal(qty)) return qty;
    const sign = qty.startsWith('-') ? '-' : '';
    const body = trimFractionZeros(qty.slice(sign.length));
    const [intPart, fraction] = body.split('.');
    const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return `${sign}${grouped}${fraction === undefined ? '' : `.${fraction}`}`;
}

export function sameOrder(expected, actual) {
    return ORDER_FIELDS.filter((field) => {
        if (DECIMAL_FIELDS.has(field)) {
            try {
                return fromString(expected?.[field]) !== fromString(actual?.[field]);
            } catch {
                return expected?.[field] !== actual?.[field];
            }
        }
        if (field === 'orderId') return String(expected?.[field]) !== String(actual?.[field]);
        return expected?.[field] !== actual?.[field];
    });
}

export function createModifyIdGenerator(state = {}) {
    let lastMs = state?.lastMs ?? null;
    let lastSequence = state?.lastSequence ?? -1;
    const maxMs = Math.floor((Number.MAX_SAFE_INTEGER - 999) / 1000);

    return {
        next(nowMs) {
            if (!Number.isSafeInteger(nowMs) || nowMs <= 0 || nowMs > maxMs) {
                throw new RangeError('수정 식별자에 쓸 시각이 안전 범위를 벗어났습니다');
            }

            let ms;
            let sequence;
            if (lastMs === null || nowMs > lastMs) {
                ms = nowMs;
                sequence = 0;
            } else if (nowMs === lastMs && lastSequence < 999) {
                ms = lastMs;
                sequence = lastSequence + 1;
            } else {
                ms = lastMs + 1;
                sequence = 0;
            }

            const value = ms * 1000 + sequence;
            if (!Number.isSafeInteger(value) || value <= 0) {
                throw new RangeError('수정 식별자가 안전한 정수 범위를 벗어났습니다');
            }
            lastMs = ms;
            lastSequence = sequence;
            return value;
        },
        snapshot() {
            return { lastMs, lastSequence };
        },
    };
}

export function symbolFromPageUrl(url) {
    let parsed;
    try {
        parsed = new URL(url);
    } catch {
        return null;
    }
    if (parsed.protocol !== 'https:' || parsed.hostname !== 'www.binance.com') return null;

    const match = parsed.pathname.match(/^\/(?:[A-Za-z-]+\/)?futures\/([A-Za-z0-9]+)$/);
    if (!match) return null;
    const symbol = match[1].toUpperCase();
    return /^[A-Z0-9]{4,20}$/.test(symbol) ? symbol : null;
}

export function classifyModifyResponse(sent, response) {
    if (String(response?.orderId) !== String(sent?.orderId)) {
        return { kind: 'MISMATCH', reason: '수정 응답의 주문 ID가 다릅니다' };
    }
    if (String(response?.modifyId) !== String(sent?.modifyId)) {
        return { kind: 'MISMATCH', reason: '수정 응답의 수정 ID가 다릅니다' };
    }
    if (response?.price === undefined || response?.price === null || response.price === '') {
        return { kind: 'MISMATCH', reason: '수정 응답에 가격이 없습니다' };
    }
    if (!OPEN_STATUSES.has(response.status)) {
        return { kind: 'MISMATCH', reason: '수정 응답의 주문 상태가 미체결이 아닙니다' };
    }
    return { kind: 'CHASED', price: response.price, status: response.status, modifyId: response.modifyId };
}

export function amendmentTraced(amendments, modifyId) {
    return (amendments || []).some((amendment) => (
        String(amendment?.amendment?.modifyId) === String(modifyId)
        || String(amendment?.modifyId) === String(modifyId)
    ));
}
