// 증거금 검사. 순수 함수 — 브라우저 API 도 네트워크도 모른다.
//
// 필요 증거금 = 실제 주문 명목금액 합계 / 레버리지.
// 비교 대상은 지갑 잔고가 아니라 가용 잔고(availableBalance)다 — 이미 걸어 둔 주문과
// 보유 포지션이 잡아 둔 증거금이 빠진 값이라, 그걸 써야 이중으로 세지 않는다.

import * as D from './decimal.js';

// 레버리지를 못 읽었으면 막지 않는다. 검사하지 못했다는 것과
// 부족하다는 것은 다르고, 못 읽었다고 정상 주문을 막으면 안 된다.
export function checkMargin({ actualNotional, leverage, availableBalance }) {
    if (!isPositive(leverage) || !isDecimal(actualNotional) || !isDecimal(availableBalance)) {
        return { kind: 'UNKNOWN', required: null, available: null, shortfall: null };
    }

    const notional = D.fromString(actualNotional);
    const available = D.fromString(availableBalance);
    const required = D.div(notional, D.fromString(String(leverage)));

    const format = (value) => D.format(value, 2);
    if (required > available) {
        return {
            kind: 'INSUFFICIENT',
            required: format(required),
            available: format(available),
            shortfall: format(required - available),
        };
    }
    return {
        kind: 'OK',
        required: format(required),
        available: format(available),
        shortfall: null,
    };
}

function isDecimal(value) {
    return /^\d+(\.\d+)?$/.test(String(value ?? '').trim());
}

function isPositive(value) {
    const text = String(value ?? '').trim();
    return isDecimal(text) && D.fromString(text) > 0n;
}
