import test from 'node:test';
import assert from 'node:assert/strict';
import { formatUsdtRateLabel } from './binanceTickerCardView.js';

test('formatUsdtRateLabel keeps live USDT text stable', () => {
    assert.equal(
        formatUsdtRateLabel({ trade_price: 1432.4 }),
        '1 USDT = ₩1,432',
    );
    assert.equal(
        formatUsdtRateLabel(null),
        '1 USDT = ...',
    );
});
