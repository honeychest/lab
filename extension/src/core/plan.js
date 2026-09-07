// 분할 주문 계획 산출. 순수 함수 — 브라우저 API 도 네트워크도 모른다.
//
// 두 가지를 명확히 나눈다.
//   targetNotional  배분 목표 금액. 합계는 정확히 사용자가 입력한 총액이다.
//   actualNotional  수량을 주문단위로 내린 뒤의 실제 금액. 합계는 목표보다 작다.
// 둘을 하나로 뭉치면 화면의 합계와 실제 나가는 금액이 조용히 어긋난다.

import * as D from './decimal.js';
import { checkLevel, checkSymbolTradable } from './filters.js';

export const MULTIPLIER_MIN = 1.0;
export const MULTIPLIER_MAX = 3.0;
export const MULTIPLIER_STEP = '0.1';
export const LEVEL_MIN = 2;
export const LEVEL_MAX = 20;
export const RANGE_MAX = 0.9;

const ONE = D.fromString('1');

// 금액 표시 자릿수. USDT 는 8자리면 충분하고, 목표 금액을 이 단위로 맞춰 두면
// 화면의 "목표" 열 합계가 사용자가 입력한 총액과 정확히 같아진다.
const MONEY_DECIMALS = 8;
const MONEY_STEP = D.fromString('0.00000001');

export function buildPlan(input, rules) {
    const reasons = validate(input, rules);
    if (reasons.length) return { ok: false, reasons };

    const side = input.side;
    const levelCount = input.levelCount;
    const warnings = [];

    const tick = D.fromString(rules.tickSize);
    const step = D.fromString(rules.stepSize);
    const tickDecimals = D.decimalsOf(rules.tickSize);
    const stepDecimals = D.decimalsOf(rules.stepSize);

    // 기준가를 호가단위에 맞춘다. 유리한 쪽으로 — 롱 매수는 내림, 숏 매도는 올림.
    const anchorRaw = D.fromString(input.anchorPrice);
    const anchor = side === 'LONG' ? D.floorToStep(anchorRaw, tick) : D.ceilToStep(anchorRaw, tick);
    if (anchor !== anchorRaw) {
        warnings.push(`기준가를 호가단위에 맞춰 ${D.format(anchor, tickDecimals)} 로 조정했습니다`);
    }

    // 가격 등비 비율. 지수가 1/(n-1) 이라 무리수가 되므로 여기서만 부동소수를 쓴다.
    // 결과는 곧바로 호가단위로 양자화되므로 유효하지 않은 가격이 나올 수는 없다.
    const range = Math.abs(input.rangePct);
    const endFactor = side === 'LONG' ? 1 - range : 1 + range;
    const ratio = D.fromNumber(Math.pow(endFactor, 1 / (levelCount - 1)));

    const prices = [];
    for (let i = 0; i < levelCount; i += 1) {
        const raw = D.mul(anchor, D.pow(ratio, i));
        prices.push(side === 'LONG' ? D.floorToStep(raw, tick) : D.ceilToStep(raw, tick));
    }
    if (new Set(prices.map(String)).size !== prices.length) {
        warnings.push('가격을 호가단위에 맞추면서 같은 가격이 되는 회차가 있습니다');
    }

    const targets = buildTargets(D.fromString(input.totalNotional), D.fromString(String(input.multiplier)), levelCount);

    const levels = [];
    for (let i = 0; i < levelCount; i += 1) {
        const price = prices[i];
        const target = targets[i];
        const quantity = D.floorToStep(D.div(target, price), step);
        const actual = D.mul(quantity, price);
        const level = {
            seq: i + 1,
            price: D.format(price, tickDecimals),
            targetNotional: D.format(target, MONEY_DECIMALS),
            quantity: D.format(quantity, stepDecimals),
            actualNotional: D.format(actual, MONEY_DECIMALS),
            skipReason: null,
        };
        level.skipReason = checkLevel(level, rules);
        levels.push(level);
    }

    const sendable = levels.filter((l) => !l.skipReason);
    if (!sendable.length) {
        warnings.push('전송할 수 있는 회차가 없습니다. 총액을 늘리거나 회차를 줄여 보세요');
    } else if (sendable.length !== levels.length) {
        warnings.push(`${levels.length - sendable.length}건이 심볼 제한에 걸려 제외됩니다`);
    }

    let actualTotal = 0n;
    let totalQuantity = 0n;
    for (const level of sendable) {
        actualTotal += D.fromString(level.actualNotional);
        totalQuantity += D.fromString(level.quantity);
    }
    const averagePrice = totalQuantity > 0n ? D.div(actualTotal, totalQuantity) : 0n;

    return {
        ok: true,
        side,
        levelCount,
        levels,
        warnings,
        totals: {
            targetNotional: D.format(D.fromString(input.totalNotional), MONEY_DECIMALS),
            actualNotional: D.format(actualTotal, MONEY_DECIMALS),
            totalQuantity: D.format(totalQuantity, stepDecimals),
            averagePrice: D.format(averagePrice, tickDecimals),
            sendCount: sendable.length,
            skipCount: levels.length - sendable.length,
        },
    };
}

// 마틴게일 배분. a(1) = total * (r-1) / (r^n - 1), a(i) = a(1) * r^(i-1).
// 나눗셈 잔여는 마지막 회차에 몰아 목표 합계를 정확히 total 로 맞춘다.
function buildTargets(total, multiplier, levelCount) {
    const targets = [];
    if (multiplier === ONE) {
        const each = D.div(total, D.fromNumber(levelCount));
        for (let i = 0; i < levelCount; i += 1) targets.push(each);
    } else {
        const denominator = D.pow(multiplier, levelCount) - ONE;
        const first = D.div(D.mul(total, multiplier - ONE), denominator);
        for (let i = 0; i < levelCount; i += 1) targets.push(D.mul(first, D.pow(multiplier, i)));
    }
    // 표시 단위로 먼저 맞춘 뒤 잔여를 마지막 회차에 몰아야
    // 화면에 찍히는 금액들의 합이 총액과 정확히 같아진다.
    const quantized = targets.map((v) => D.floorToStep(v, MONEY_STEP));
    const sum = quantized.slice(0, -1).reduce((acc, v) => acc + v, 0n);
    quantized[levelCount - 1] = total - sum;
    return quantized;
}

function validate(input, rules) {
    const reasons = [];

    if (input.side !== 'LONG' && input.side !== 'SHORT') {
        reasons.push('방향은 LONG 또는 SHORT 여야 합니다');
    }
    if (!Number.isInteger(input.levelCount) || input.levelCount < LEVEL_MIN || input.levelCount > LEVEL_MAX) {
        reasons.push(`회차는 ${LEVEL_MIN} 이상 ${LEVEL_MAX} 이하의 정수여야 합니다`);
    }
    const range = Math.abs(Number(input.rangePct));
    if (!Number.isFinite(range) || range <= 0 || range >= RANGE_MAX) {
        reasons.push(`범위는 0 초과 ${RANGE_MAX} 미만이어야 합니다`);
    }
    reasons.push(...requirePositiveDecimal(input.anchorPrice, '기준가'));
    reasons.push(...requirePositiveDecimal(input.totalNotional, '총액'));

    const multiplierText = String(input.multiplier);
    if (!/^\d+(\.\d+)?$/.test(multiplierText)) {
        reasons.push('배율을 십진수로 읽을 수 없습니다');
    } else {
        const multiplier = D.fromString(multiplierText);
        const min = D.fromNumber(MULTIPLIER_MIN);
        const max = D.fromNumber(MULTIPLIER_MAX);
        if (multiplier < min || multiplier > max) {
            reasons.push(`배율은 ${MULTIPLIER_MIN} 이상 ${MULTIPLIER_MAX} 이하여야 합니다`);
        } else if (!D.isMultipleOf(multiplier, D.fromString(MULTIPLIER_STEP))) {
            reasons.push(`배율은 ${MULTIPLIER_STEP} 단위여야 합니다`);
        }
    }

    if (!rules) {
        reasons.push('심볼 규칙을 받지 못했습니다');
    } else {
        reasons.push(...checkSymbolTradable(rules));
    }
    return reasons;
}

function requirePositiveDecimal(value, name) {
    const text = String(value ?? '').trim();
    if (!/^\d+(\.\d+)?$/.test(text)) return [`${name}를 십진수로 읽을 수 없습니다`];
    if (D.fromString(text) <= 0n) return [`${name}는 0보다 커야 합니다`];
    return [];
}

// 승인 대조용 정규 문자열. 최종 양자화된 값과 주문 파라미터를 전부 넣는다.
// 입력값만 해시하면 같은 입력이 다른 필터로 다른 주문이 되는 경우를 못 잡는다.
export function canonicalOf(plan, meta) {
    const head = [meta.symbol, plan.side, meta.positionSide, meta.timeInForce].join('|');
    const body = plan.levels
        .filter((l) => !l.skipReason)
        .map((l) => [l.seq, l.price, l.quantity].join(':'))
        .join(',');
    return `${head}#${body}`;
}

export async function digestOf(canonical) {
    const bytes = new TextEncoder().encode(canonical);
    const hash = await globalThis.crypto.subtle.digest('SHA-256', bytes);
    return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
