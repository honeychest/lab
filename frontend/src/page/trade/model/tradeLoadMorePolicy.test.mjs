import test from 'node:test';
import assert from 'node:assert/strict';
import { getOldestTradeId, shouldLoadMoreTrades } from './tradeLoadMorePolicy.js';

test('getOldestTradeId returns last trade id', () => {
    assert.equal(getOldestTradeId([{ id: 3 }, { id: 2 }, { id: 1 }]), 1);
});

test('getOldestTradeId returns null for empty trades', () => {
    assert.equal(getOldestTradeId([]), null);
    assert.equal(getOldestTradeId(null), null);
});

test('shouldLoadMoreTrades requires mobile idle state and existing trades', () => {
    assert.equal(shouldLoadMoreTrades({ isMobile: true, isLoadingMore: false, tradeCount: 1 }), true);
    assert.equal(shouldLoadMoreTrades({ isMobile: false, isLoadingMore: false, tradeCount: 1 }), false);
    assert.equal(shouldLoadMoreTrades({ isMobile: true, isLoadingMore: true, tradeCount: 1 }), false);
    assert.equal(shouldLoadMoreTrades({ isMobile: true, isLoadingMore: false, tradeCount: 0 }), false);
});
