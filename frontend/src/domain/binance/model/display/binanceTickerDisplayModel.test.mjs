import test from 'node:test';
import assert from 'node:assert/strict';
import {
    buildBinanceTickerDisplayModel,
    formatBinancePrice,
    formatPremiumKrwAbs,
} from './binanceTickerDisplayModel.js';

test('buildBinanceTickerDisplayModel calculates KRW premium from Binance, Upbit, and USDT rate', () => {
    const model = buildBinanceTickerDisplayModel({
        ticker: {
            c: '100.00',
            P: '1.25',
            h: '110.00',
            l: '90.00',
            p: '1.23',
            b: '99.00',
            a: '101.00',
            w: '98.50',
            v: '12.34',
            q: '1234.56',
            n: 42,
        },
        upbitTicker: { trade_price: 145000 },
        usdtKrwTicker: { trade_price: 1400 },
    });

    assert.equal(model.calcKrw, 140000);
    assert.equal(model.premium, 5000);
    assert.equal(model.premiumRate, 3.571428571428571);
    assert.equal(model.premiumSign, '+');
    assert.equal(model.premiumColor, '#2ecc71');
});

test('display formatters keep ticker price and premium labels stable', () => {
    assert.equal(formatBinancePrice('42000.53000000'), '$42,000.53');
    assert.equal(formatPremiumKrwAbs(-1234567), '₩1,234,567');
});
