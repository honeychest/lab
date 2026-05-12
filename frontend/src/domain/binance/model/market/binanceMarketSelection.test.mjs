import test from 'node:test';
import assert from 'node:assert/strict';
import {
    BINANCE_MARKETS,
    getSelectedBinanceMarket,
    getUpbitSubscriptionCodes,
} from './binanceMarketSelection.js';

test('getSelectedBinanceMarket falls back to first configured market', () => {
    assert.equal(
        getSelectedBinanceMarket('UNKNOWN').symbol,
        BINANCE_MARKETS[0].symbol,
    );
});

test('getUpbitSubscriptionCodes always includes KRW-USDT', () => {
    assert.deepEqual(
        getUpbitSubscriptionCodes({ upbitCode: 'KRW-BTC' }),
        ['KRW-BTC', 'KRW-USDT'],
    );
    assert.deepEqual(
        getUpbitSubscriptionCodes({ upbitCode: null }),
        ['KRW-USDT'],
    );
});
