import test from 'node:test';
import assert from 'node:assert/strict';
import { getBinanceExchangePairLabel } from './binancePageView.js';

test('getBinanceExchangePairLabel preserves page exchange branding', () => {
    assert.deepEqual(getBinanceExchangePairLabel(), {
        left: 'Binance',
        separator: '×',
        right: 'Upbit',
    });
});
