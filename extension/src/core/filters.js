// 주문 필터 검증기.
//
// 계산(plan.js)과 API 계약을 분리해 둔다. 같은 검증기를 미리보기와
// 전송 직전 두 번 돌린다 — 미리보기가 통과해도 그 사이 호가가 움직여
// PERCENT_PRICE 에 걸릴 수 있기 때문이다.

import * as D from './decimal.js';

// exchangeInfo 응답의 심볼 하나를 우리 계약으로 정규화한다.
export function toSymbolRules(symbolInfo) {
    const filters = {};
    for (const f of symbolInfo.filters || []) filters[f.filterType] = f;

    const price = filters.PRICE_FILTER || {};
    const lot = filters.LOT_SIZE || {};
    const notional = filters.MIN_NOTIONAL || filters.NOTIONAL || {};
    const percent = filters.PERCENT_PRICE || {};

    return {
        symbol: symbolInfo.symbol,
        status: symbolInfo.status,
        orderTypes: symbolInfo.orderTypes || [],
        timeInForce: symbolInfo.timeInForce || [],
        tickSize: price.tickSize,
        minPrice: price.minPrice,
        maxPrice: price.maxPrice,
        stepSize: lot.stepSize,
        minQty: lot.minQty,
        maxQty: lot.maxQty,
        minNotional: notional.notional ?? notional.minNotional,
        multiplierUp: percent.multiplierUp,
        multiplierDown: percent.multiplierDown,
    };
}

// 심볼 자체가 이 기능을 받을 수 있는지. 못 받으면 계획을 만들지 않는다.
export function checkSymbolTradable(rules) {
    const reasons = [];
    if (rules.status && rules.status !== 'TRADING') {
        reasons.push(`심볼 상태가 TRADING 이 아닙니다 (${rules.status})`);
    }
    if (rules.orderTypes.length && !rules.orderTypes.includes('LIMIT')) {
        reasons.push('이 심볼은 LIMIT 주문을 받지 않습니다');
    }
    if (rules.timeInForce.length && !rules.timeInForce.includes('GTC')) {
        reasons.push('이 심볼은 GTC 를 받지 않습니다');
    }
    for (const key of ['tickSize', 'stepSize', 'minQty']) {
        if (!rules[key]) reasons.push(`심볼 규칙에 ${key} 가 없습니다`);
    }
    return reasons;
}

// 회차 하나를 검사한다. 통과하면 null, 걸리면 사유 문자열.
// 사유가 붙은 회차는 전송 대상에서 빠지고 표에 그대로 표시된다.
export function checkLevel(level, rules) {
    const price = D.fromString(level.price);
    const quantity = D.fromString(level.quantity);
    const notional = D.fromString(level.actualNotional);

    if (quantity <= 0n) return '최소수량 미달';
    if (rules.minQty && quantity < D.fromString(rules.minQty)) return '최소수량 미달';
    if (rules.maxQty && quantity > D.fromString(rules.maxQty)) return '최대수량 초과';
    if (rules.minPrice && D.fromString(rules.minPrice) > 0n && price < D.fromString(rules.minPrice)) {
        return '최소가격 미달';
    }
    if (rules.maxPrice && D.fromString(rules.maxPrice) > 0n && price > D.fromString(rules.maxPrice)) {
        return '최대가격 초과';
    }
    if (rules.minNotional && notional < D.fromString(rules.minNotional)) return '최소명목 미달';

    if (!D.isMultipleOf(price, D.fromString(rules.tickSize))) return '가격이 호가단위 배수가 아님';
    if (!D.isMultipleOf(quantity, D.fromString(rules.stepSize))) return '수량이 주문단위 배수가 아님';

    return null;
}

// PERCENT_PRICE. 마크가가 있어야 판정되므로 별도로 둔다.
// 마크가를 못 받았으면 검사하지 않고 null 을 돌려준다(막지 않는다).
//
// 방향마다 막는 쪽이 다르다. 양쪽을 다 보면 안 된다.
//   매수(BUY)  price <= 마크가 * multiplierUp    시장가보다 너무 위에서 사는 것만 막는다
//   매도(SELL) price >= 마크가 * multiplierDown  시장가보다 너무 아래서 파는 것만 막는다
// 마크가보다 한참 아래에 매수 지정가를 거는 것은 제한이 없다 — 분할 매수의 본질이 그것이다.
export function checkPercentPrice(priceStr, referencePriceStr, rules, side) {
    if (!referencePriceStr) return null;
    const price = D.fromString(priceStr);
    const reference = D.fromString(referencePriceStr);

    if (side === 'LONG') {
        if (!rules.multiplierUp) return null;
        const upper = D.mul(reference, D.fromString(rules.multiplierUp));
        return price > upper ? '허용범위 초과' : null;
    }
    if (!rules.multiplierDown) return null;
    const lower = D.mul(reference, D.fromString(rules.multiplierDown));
    return price < lower ? '허용범위 미달' : null;
}
