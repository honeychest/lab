import test from 'node:test';
import assert from 'node:assert/strict';
import { validateExpectedPnlOrders } from '../src/core/expected-pnl-validation.js';

const order = {
    requestKey: 'row-1',
    symbol: 'BTCUSDT',
    side: 'SELL',
    positionSide: 'LONG',
    reduceOnly: true,
    price: '60000',
    origQty: '1.5',
    executedQty: '0.5',
};

test('EXPECTED_PNL의 price·origQty·executedQty 숫자 타입 입력을 거부한다', () => {
    for (const field of ['price', 'origQty', 'executedQty']) {
        const result = validateExpectedPnlOrders([{ ...order, [field]: 1 }]);
        assert.equal(result.ok, false, field);
    }
    assert.equal(validateExpectedPnlOrders([order]).ok, true);
});

test('EXPECTED_PNL의 가격·수량은 일반 십진수 문자열만 허용한다', () => {
    const invalidValues = ['1e3', '-1', '.5', '1.', '', ' ', '1,000'];
    for (const field of ['price', 'origQty', 'executedQty']) {
        for (const value of invalidValues) {
            const result = validateExpectedPnlOrders([{ ...order, [field]: value }]);
            assert.equal(result.ok, false, `${field}=${JSON.stringify(value)}`);
        }
    }
});

test('EXPECTED_PNL은 0과 긴 소수 문자열을 허용한다', () => {
    for (const field of ['price', 'origQty', 'executedQty']) {
        assert.equal(validateExpectedPnlOrders([{ ...order, [field]: '0' }]).ok, true, field);
        assert.equal(
            validateExpectedPnlOrders([{
                ...order,
                [field]: `0.${'1'.repeat(200)}`,
            }]).ok,
            true,
            field,
        );
    }
});
