import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPlan, canonicalOf, digestOf } from '../src/core/plan.js';
import * as D from '../src/core/decimal.js';

const BTC = {
    symbol: 'BTCUSDT',
    status: 'TRADING',
    orderTypes: ['LIMIT', 'MARKET', 'STOP'],
    timeInForce: ['GTC', 'IOC', 'FOK'],
    tickSize: '0.10',
    minPrice: '556.80',
    maxPrice: '4529764',
    stepSize: '0.001',
    minQty: '0.001',
    maxQty: '1000',
    minNotional: '100',
};

// 필터가 느슨한 가상 심볼. 필터 영향을 뺀 순수 배분을 볼 때 쓴다.
const LOOSE = {
    ...BTC,
    symbol: 'LOOSEUSDT',
    tickSize: '0.0001',
    stepSize: '0.00000001',
    minQty: '0.00000001',
    minNotional: '0',
};

const base = {
    side: 'LONG',
    anchorPrice: '80000',
    rangePct: 0.4,
    levelCount: 9,
    totalNotional: '30000',
    multiplier: '2.0',
};

function sum(levels, key) {
    return levels.reduce((acc, l) => acc + D.fromString(l[key]), 0n);
}

test('목표 배분의 합계는 총액과 정확히 일치한다', () => {
    for (const multiplier of ['1.0', '1.5', '2.0', '3.0']) {
        const plan = buildPlan({ ...base, multiplier }, LOOSE);
        assert.equal(plan.ok, true);
        assert.equal(sum(plan.levels, 'targetNotional'), D.fromString('30000'), `배율 ${multiplier}`);
    }
});

test('배율만큼 회차 금액이 등비로 늘어난다', () => {
    const plan = buildPlan({ ...base, multiplier: '2.0' }, LOOSE);
    for (let i = 1; i < plan.levels.length - 1; i += 1) {
        const prev = D.fromString(plan.levels[i - 1].targetNotional);
        const cur = D.fromString(plan.levels[i].targetNotional);
        assert.equal(D.format(D.div(cur, prev), 6), '2.000000');
    }
});

test('배율 1 은 균등 분할이다', () => {
    const plan = buildPlan({ ...base, multiplier: '1.0' }, LOOSE);
    const first = plan.levels[0].targetNotional;
    for (const level of plan.levels.slice(0, -1)) {
        assert.equal(level.targetNotional, first);
    }
});

test('롱은 가격이 내려가고 양끝이 기준가와 범위 끝점이다', () => {
    const plan = buildPlan(base, BTC);
    assert.equal(plan.levels[0].price, '80000.0');
    assert.equal(plan.levels[8].price, '48000.0');
    for (let i = 1; i < plan.levels.length; i += 1) {
        assert.ok(D.fromString(plan.levels[i].price) < D.fromString(plan.levels[i - 1].price));
    }
});

test('숏은 가격이 올라가고 끝점이 +범위다', () => {
    const plan = buildPlan({ ...base, side: 'SHORT' }, BTC);
    assert.equal(plan.levels[0].price, '80000.0');
    assert.equal(plan.levels[8].price, '112000.0');
    for (let i = 1; i < plan.levels.length; i += 1) {
        assert.ok(D.fromString(plan.levels[i].price) > D.fromString(plan.levels[i - 1].price));
    }
});

test('모든 가격과 수량이 심볼 단위의 정확한 배수다', () => {
    const plan = buildPlan(base, BTC);
    const tick = D.fromString(BTC.tickSize);
    const step = D.fromString(BTC.stepSize);
    for (const level of plan.levels) {
        assert.ok(D.isMultipleOf(D.fromString(level.price), tick), `가격 ${level.price}`);
        assert.ok(D.isMultipleOf(D.fromString(level.quantity), step), `수량 ${level.quantity}`);
    }
});

test('BTCUSDT 예시: 앞 회차가 심볼 제한에 걸려 제외되고 실제 합계가 목표보다 작다', () => {
    const plan = buildPlan(base, BTC);
    assert.equal(plan.ok, true);

    assert.equal(plan.levels[0].skipReason, '최소수량 미달');
    assert.equal(plan.levels[1].skipReason, '최소명목 미달');
    for (const level of plan.levels.slice(2)) {
        assert.equal(level.skipReason, null, `${level.seq}회차`);
    }

    assert.equal(plan.totals.sendCount, 7);
    assert.equal(plan.totals.skipCount, 2);
    assert.equal(D.fromString(plan.totals.targetNotional), D.fromString('30000'));

    // 실제 합계는 목표보다 작아야 하고, 평균단가는 구간 안에 있어야 한다.
    assert.ok(D.fromString(plan.totals.actualNotional) < D.fromString(plan.totals.targetNotional));
    const average = D.fromString(plan.totals.averagePrice);
    assert.ok(average > D.fromString('48000') && average < D.fromString('80000'));
});

test('제외 회차는 실제 합계와 평균단가 계산에서 빠진다', () => {
    const plan = buildPlan(base, BTC);
    const sendable = plan.levels.filter((l) => !l.skipReason);
    assert.equal(sum(sendable, 'actualNotional'), D.fromString(plan.totals.actualNotional));
    assert.equal(sum(sendable, 'quantity'), D.fromString(plan.totals.totalQuantity));
});

test('총액을 늘리면 제외가 사라진다', () => {
    const plan = buildPlan({ ...base, totalNotional: '300000' }, BTC);
    assert.equal(plan.totals.skipCount, 0);
    assert.equal(plan.totals.sendCount, 9);
});

test('기준가가 호가단위 배수가 아니면 맞추고 알린다', () => {
    const plan = buildPlan({ ...base, anchorPrice: '80000.07' }, BTC);
    assert.equal(plan.levels[0].price, '80000.0');
    assert.ok(plan.warnings.some((w) => w.includes('호가단위')));
});

test('숏에서는 기준가를 올림으로 맞춘다', () => {
    const plan = buildPlan({ ...base, side: 'SHORT', anchorPrice: '80000.07' }, BTC);
    assert.equal(plan.levels[0].price, '80000.1');
});

test('배율이 범위 밖이거나 0.1 단위가 아니면 계획을 만들지 않는다', () => {
    for (const multiplier of ['0.9', '3.1', '2.05']) {
        const plan = buildPlan({ ...base, multiplier }, BTC);
        assert.equal(plan.ok, false, `배율 ${multiplier}`);
    }
    assert.equal(buildPlan({ ...base, multiplier: '2.1' }, BTC).ok, true);
});

test('회차와 범위의 경계를 막는다', () => {
    assert.equal(buildPlan({ ...base, levelCount: 1 }, BTC).ok, false);
    assert.equal(buildPlan({ ...base, levelCount: 21 }, BTC).ok, false);
    assert.equal(buildPlan({ ...base, rangePct: 0 }, BTC).ok, false);
    assert.equal(buildPlan({ ...base, rangePct: 0.9 }, BTC).ok, false);
    assert.equal(buildPlan({ ...base, rangePct: -0.4 }, BTC).ok, true, '음수 범위는 절댓값으로 정규화');
});

test('입력값이 숫자가 아니면 막는다', () => {
    assert.equal(buildPlan({ ...base, anchorPrice: '' }, BTC).ok, false);
    assert.equal(buildPlan({ ...base, totalNotional: '-1' }, BTC).ok, false);
    assert.equal(buildPlan({ ...base, side: 'BOTH' }, BTC).ok, false);
});

test('거래 불가 심볼은 계획을 만들지 않는다', () => {
    assert.equal(buildPlan(base, { ...BTC, status: 'BREAK' }).ok, false);
    assert.equal(buildPlan(base, { ...BTC, orderTypes: ['MARKET'] }).ok, false);
    assert.equal(buildPlan(base, { ...BTC, timeInForce: ['IOC'] }).ok, false);
});

test('digest 는 최종 양자화 값이 하나만 달라도 달라진다', async () => {
    const meta = { symbol: 'BTCUSDT', positionSide: 'LONG', timeInForce: 'GTC' };
    const a = buildPlan(base, BTC);
    const b = buildPlan({ ...base, totalNotional: '60000' }, BTC);
    const same = buildPlan(base, BTC);

    assert.equal(await digestOf(canonicalOf(a, meta)), await digestOf(canonicalOf(same, meta)));
    assert.notEqual(await digestOf(canonicalOf(a, meta)), await digestOf(canonicalOf(b, meta)));
    assert.notEqual(
        await digestOf(canonicalOf(a, meta)),
        await digestOf(canonicalOf(a, { ...meta, positionSide: 'SHORT' })),
    );
});

test('digest 는 제외된 회차를 포함하지 않는다', () => {
    const meta = { symbol: 'BTCUSDT', positionSide: 'LONG', timeInForce: 'GTC' };
    const canonical = canonicalOf(buildPlan(base, BTC), meta);
    assert.ok(!canonical.includes('1:80000.0'));
    assert.ok(canonical.includes('9:48000.0'));
});
