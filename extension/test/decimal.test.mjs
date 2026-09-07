import test from 'node:test';
import assert from 'node:assert/strict';
import * as D from '../src/core/decimal.js';

test('부동소수 오차가 나는 경계에서도 정확히 양자화한다', () => {
    // 0.1 * 3 === 0.30000000000000004 이라 부동소수 floor 은 0.2 로 떨어진다.
    const step = D.fromString('0.1');
    const value = D.fromString('0.3');
    assert.equal(D.format(D.floorToStep(value, step), 1), '0.3');
    assert.ok(D.isMultipleOf(D.floorToStep(value, step), step));
});

test('주문단위 배수로 내린다', () => {
    const step = D.fromString('0.001');
    assert.equal(D.format(D.floorToStep(D.fromString('0.0739'), step), 3), '0.073');
    assert.equal(D.format(D.floorToStep(D.fromString('0.0009'), step), 3), '0.000');
    assert.equal(D.format(D.floorToStep(D.fromString('1'), step), 3), '1.000');
});

test('단순하지 않은 단위(0.0025)도 정확히 맞춘다', () => {
    const step = D.fromString('0.0025');
    const floored = D.floorToStep(D.fromString('0.0074'), step);
    assert.equal(D.format(floored, 4), '0.0050');
    assert.ok(D.isMultipleOf(floored, step));

    const ceiled = D.ceilToStep(D.fromString('0.0074'), step);
    assert.equal(D.format(ceiled, 4), '0.0075');
    assert.ok(D.isMultipleOf(ceiled, step));
});

test('이미 배수인 값은 올림에서 그대로 둔다', () => {
    const step = D.fromString('0.1');
    assert.equal(D.format(D.ceilToStep(D.fromString('75051.4'), step), 1), '75051.4');
});

test('소수 자릿수를 센다', () => {
    assert.equal(D.decimalsOf('0.001'), 3);
    assert.equal(D.decimalsOf('1'), 0);
    assert.equal(D.decimalsOf('0.10'), 1);
    assert.equal(D.decimalsOf('0.0025'), 4);
});

test('큰 가격과 작은 수량을 함께 다뤄도 어긋나지 않는다', () => {
    const price = D.fromString('80000.0');
    const quantity = D.fromString('0.001');
    assert.equal(D.format(D.mul(price, quantity), 4), '80.0000');
    assert.equal(D.format(D.div(D.fromString('58.70841487'), price), 8), '0.00073385');
});

test('지수 표기 숫자도 읽는다', () => {
    assert.equal(D.format(D.fromNumber(1e-7), 8), '0.00000010');
});

test('0 으로 나누거나 음수를 양자화하면 막는다', () => {
    assert.throws(() => D.div(D.fromString('1'), 0n));
    assert.throws(() => D.floorToStep(D.fromString('-1'), D.fromString('0.1')));
    assert.throws(() => D.fromNumber(Number.NaN));
});
