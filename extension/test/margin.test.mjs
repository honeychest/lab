import test from 'node:test';
import assert from 'node:assert/strict';
import { checkMargin } from '../src/core/margin.js';

test('필요 증거금은 명목금액을 레버리지로 나눈 값이다', () => {
    const result = checkMargin({ actualNotional: '30000', leverage: '10', availableBalance: '5000' });
    assert.equal(result.kind, 'OK');
    assert.equal(result.required, '3000.00');
    assert.equal(result.available, '5000.00');
});

test('레버리지가 낮으면 같은 명목에 더 많은 증거금이 든다', () => {
    const ten = checkMargin({ actualNotional: '30000', leverage: '10', availableBalance: '99999' });
    const two = checkMargin({ actualNotional: '30000', leverage: '2', availableBalance: '99999' });
    assert.equal(ten.required, '3000.00');
    assert.equal(two.required, '15000.00');
});

test('가용 잔고보다 많이 들면 부족으로 판정하고 모자란 액수를 낸다', () => {
    const result = checkMargin({ actualNotional: '30000', leverage: '2', availableBalance: '5000' });
    assert.equal(result.kind, 'INSUFFICIENT');
    assert.equal(result.required, '15000.00');
    assert.equal(result.shortfall, '10000.00');
});

test('딱 맞으면 통과시킨다', () => {
    const result = checkMargin({ actualNotional: '30000', leverage: '10', availableBalance: '3000' });
    assert.equal(result.kind, 'OK');
    assert.equal(result.shortfall, null);
});

test('1 USDT 모자라도 부족으로 잡는다', () => {
    const result = checkMargin({ actualNotional: '30000', leverage: '10', availableBalance: '2999' });
    assert.equal(result.kind, 'INSUFFICIENT');
    assert.equal(result.shortfall, '1.00');
});

test('나누어떨어지지 않는 레버리지도 정확히 계산한다', () => {
    const result = checkMargin({ actualNotional: '29666.1', leverage: '3', availableBalance: '99999' });
    assert.equal(result.required, '9888.70');
});

// 검사하지 못한 것과 부족한 것은 다르다. 못 읽었다고 정상 주문을 막으면 안 된다.
test('레버리지나 잔고를 못 읽으면 막지 않는다', () => {
    for (const input of [
        { actualNotional: '30000', leverage: null, availableBalance: '5000' },
        { actualNotional: '30000', leverage: '0', availableBalance: '5000' },
        { actualNotional: '30000', leverage: '10', availableBalance: null },
        { actualNotional: null, leverage: '10', availableBalance: '5000' },
        { actualNotional: '30000', leverage: 'abc', availableBalance: '5000' },
    ]) {
        assert.equal(checkMargin(input).kind, 'UNKNOWN', JSON.stringify(input));
    }
});
