import test from 'node:test';
import assert from 'node:assert/strict';
import { toSymbolRules, checkSymbolTradable, checkLevel, checkPercentPrice } from '../src/core/filters.js';

const rules = {
    symbol: 'BTCUSDT',
    status: 'TRADING',
    orderTypes: ['LIMIT'],
    timeInForce: ['GTC'],
    tickSize: '0.10',
    minPrice: '556.80',
    maxPrice: '4529764',
    stepSize: '0.001',
    minQty: '0.001',
    maxQty: '1000',
    minNotional: '100',
    multiplierUp: '1.05',
    multiplierDown: '0.95',
};

function level(price, quantity, actualNotional) {
    return { price, quantity, actualNotional };
}

test('exchangeInfo 응답을 우리 계약으로 정규화한다', () => {
    const normalized = toSymbolRules({
        symbol: 'BTCUSDT',
        status: 'TRADING',
        orderTypes: ['LIMIT', 'MARKET'],
        timeInForce: ['GTC'],
        filters: [
            { filterType: 'PRICE_FILTER', tickSize: '0.10', minPrice: '556.80', maxPrice: '4529764' },
            { filterType: 'LOT_SIZE', stepSize: '0.001', minQty: '0.001', maxQty: '1000' },
            { filterType: 'MIN_NOTIONAL', notional: '100' },
            { filterType: 'PERCENT_PRICE', multiplierUp: '1.05', multiplierDown: '0.95' },
        ],
    });
    assert.equal(normalized.tickSize, '0.10');
    assert.equal(normalized.stepSize, '0.001');
    assert.equal(normalized.minNotional, '100');
    assert.equal(normalized.multiplierUp, '1.05');
});

test('거래 불가 조건을 잡는다', () => {
    assert.deepEqual(checkSymbolTradable(rules), []);
    assert.ok(checkSymbolTradable({ ...rules, status: 'BREAK' }).length);
    assert.ok(checkSymbolTradable({ ...rules, orderTypes: ['MARKET'] }).length);
    assert.ok(checkSymbolTradable({ ...rules, timeInForce: ['IOC'] }).length);
});

test('회차 하나의 필터를 판정한다', () => {
    assert.equal(checkLevel(level('70000.0', '0.003', '210'), rules), null);
    assert.equal(checkLevel(level('70000.0', '0.000', '0'), rules), '최소수량 미달');
    assert.equal(checkLevel(level('70000.0', '0.001', '70'), rules), '최소명목 미달');
    assert.equal(checkLevel(level('70000.0', '1001', '70070000'), rules), '최대수량 초과');
    assert.equal(checkLevel(level('500.0', '1', '500'), rules), '최소가격 미달');
    assert.equal(checkLevel(level('70000.05', '0.003', '210'), rules), '가격이 호가단위 배수가 아님');
    assert.equal(checkLevel(level('70000.0', '0.0035', '245'), rules), '수량이 주문단위 배수가 아님');
});

// 이 규칙을 양쪽으로 잘못 적용하면 분할 매수 자체가 막힌다.
// 마크가보다 한참 아래에 매수 지정가를 거는 것은 제한 대상이 아니다.
test('PERCENT_PRICE 는 매수의 위쪽만 막는다', () => {
    const mark = '80000';
    assert.equal(checkPercentPrice('48000', mark, rules, 'LONG'), null, '마크가 -40% 매수는 허용');
    assert.equal(checkPercentPrice('71116.2', mark, rules, 'LONG'), null, '마크가 -11% 매수는 허용');
    assert.equal(checkPercentPrice('84000', mark, rules, 'LONG'), null, '상한 1.05 이내는 허용');
    assert.equal(checkPercentPrice('84000.1', mark, rules, 'LONG'), '허용범위 초과');
});

test('PERCENT_PRICE 는 매도의 아래쪽만 막는다', () => {
    const mark = '80000';
    assert.equal(checkPercentPrice('112000', mark, rules, 'SHORT'), null, '마크가 +40% 매도는 허용');
    assert.equal(checkPercentPrice('76000', mark, rules, 'SHORT'), null, '하한 0.95 이내는 허용');
    assert.equal(checkPercentPrice('75999.9', mark, rules, 'SHORT'), '허용범위 미달');
});

test('마크가나 배수가 없으면 막지 않는다', () => {
    assert.equal(checkPercentPrice('48000', null, rules, 'LONG'), null);
    assert.equal(checkPercentPrice('48000', '80000', { ...rules, multiplierUp: null }, 'LONG'), null);
    assert.equal(checkPercentPrice('48000', '80000', { ...rules, multiplierDown: null }, 'SHORT'), null);
});
