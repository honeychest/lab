import test from 'node:test';
import assert from 'node:assert/strict';
import {
    initialTickState,
    reduceTickState,
} from './tickAccumulation.js';

test('initialTickState is zero totals and empty prevTicks', () => {
    assert.deepEqual(initialTickState(), { totals: { buy: 0, sell: 0 }, prevTicks: [] });
});

test('reconnect resets totals and prevTicks regardless of ticks', () => {
    const state = { totals: { buy: 5, sell: 3 }, prevTicks: [{}] };
    const next = reduceTickState(state, {
        ticks: [{ quantity: '1', isBuyerMaker: false }],
        isReconnecting: true,
    });
    assert.deepEqual(next, { totals: { buy: 0, sell: 0 }, prevTicks: [] });
});

test('empty ticks keeps totals, clears prevTicks', () => {
    const state = { totals: { buy: 5, sell: 3 }, prevTicks: [{}] };
    const next = reduceTickState(state, { ticks: [], isReconnecting: false });
    assert.deepEqual(next.totals, { buy: 5, sell: 3 });
    assert.deepEqual(next.prevTicks, []);
});

test('first batch — all ticks counted (prevTicks empty)', () => {
    const t1 = { quantity: '1.5', isBuyerMaker: false }; // buy
    const t2 = { quantity: '2.0', isBuyerMaker: true };  // sell
    const next = reduceTickState(initialTickState(), {
        ticks: [t1, t2],
        isReconnecting: false,
    });
    assert.deepEqual(next.totals, { buy: 1.5, sell: 2.0 });
    assert.equal(next.prevTicks.length, 2);
});

test('only reference-new ticks add to totals', () => {
    const t1 = { quantity: '1', isBuyerMaker: false };
    const t2 = { quantity: '2', isBuyerMaker: true };
    const s1 = reduceTickState(initialTickState(), { ticks: [t1], isReconnecting: false });
    const s2 = reduceTickState(s1, { ticks: [t1, t2], isReconnecting: false });
    assert.deepEqual(s2.totals, { buy: 1, sell: 2 });
});

test('identical ticks array → totals unchanged (no double counting)', () => {
    const t1 = { quantity: '1', isBuyerMaker: false };
    const s1 = reduceTickState(initialTickState(), { ticks: [t1], isReconnecting: false });
    const s2 = reduceTickState(s1, { ticks: [t1], isReconnecting: false });
    assert.deepEqual(s2.totals, s1.totals);
});

test('invalid quantities skipped (NaN, missing, zero, negative, Infinity)', () => {
    const ticks = [
        { quantity: 'NaN', isBuyerMaker: false },
        { quantity: undefined, isBuyerMaker: false },
        { quantity: '0', isBuyerMaker: false },
        { quantity: '-1', isBuyerMaker: true },
        { quantity: 'Infinity', isBuyerMaker: false },
        { quantity: '1', isBuyerMaker: false },
    ];
    const next = reduceTickState(initialTickState(), { ticks, isReconnecting: false });
    assert.deepEqual(next.totals, { buy: 1, sell: 0 });
});

test('buyerMaker mapping: true → sell, false → buy', () => {
    const ticks = [
        { quantity: '2', isBuyerMaker: true },
        { quantity: '3', isBuyerMaker: false },
    ];
    const next = reduceTickState(initialTickState(), { ticks, isReconnecting: false });
    assert.deepEqual(next.totals, { buy: 3, sell: 2 });
});

test('all-invalid additions still update prevTicks but not totals', () => {
    const t = { quantity: '0', isBuyerMaker: false };
    const next = reduceTickState(initialTickState(), { ticks: [t], isReconnecting: false });
    assert.deepEqual(next.totals, { buy: 0, sell: 0 });
    assert.equal(next.prevTicks.length, 1);
});
