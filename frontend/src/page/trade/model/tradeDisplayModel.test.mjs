import test from 'node:test';
import assert from 'node:assert/strict';
import {
    formatThreshold,
    formatTime,
    formatPrice,
    formatQty,
    formatValue,
    getElapsed,
    formatKrw,
    formatTickQtyTotal,
    USD_KRW_RATE,
} from './tradeDisplayModel.js';

test('formatThreshold returns ... when value is null/undefined', () => {
    assert.equal(formatThreshold(null), '...');
    assert.equal(formatThreshold(undefined), '...');
});

test('formatThreshold renders FUTURES / SPOT pair (SPOT = half, rounded)', () => {
    assert.equal(formatThreshold(1_000_000), '1,000,000 / 500,000 USD');
    assert.equal(formatThreshold(500_000), '500,000 / 250,000 USD');
});

test('formatTime renders HH:mm:ss in Asia/Seoul', () => {
    // 2025-01-01T00:00:00Z == 09:00:00 KST
    assert.equal(formatTime(Date.UTC(2025, 0, 1, 0, 0, 0)), '09:00:00');
    // 2025-06-15T15:30:45Z == 00:30:45 KST (next day)
    assert.equal(formatTime(Date.UTC(2025, 5, 15, 15, 30, 45)), '00:30:45');
});

test('formatPrice keeps 2 decimal places with comma', () => {
    assert.equal(formatPrice('97000'), '97,000.00');
    assert.equal(formatPrice('97000.1'), '97,000.10');
    assert.equal(formatPrice(1234.567), '1,234.57');
});

test('formatQty fixes to 4 decimals', () => {
    assert.equal(formatQty('0.123456'), '0.1235');
    assert.equal(formatQty('1'), '1.0000');
});

test('formatValue uses M suffix at or above 1,000,000', () => {
    assert.equal(formatValue(1_200_000), '$1.2M');
    assert.equal(formatValue(1_000_000), '$1.0M');
    assert.equal(formatValue(10_500_000), '$10.5M');
});

test('formatValue uses K suffix below 1,000,000 (original toFixed(0) behavior preserved)', () => {
    assert.equal(formatValue(800_000), '$800K');
    assert.equal(formatValue(0), '$0K');
    // edge: 999,999 → (999.999).toFixed(0) === '1000' — lock existing behavior
    assert.equal(formatValue(999_999), '$1000K');
});

test('getElapsed returns 방금 within 1 minute', () => {
    const now = Date.UTC(2025, 0, 1, 12, 0, 0);
    assert.equal(getElapsed(now - 30_000, now), '방금');
    assert.equal(getElapsed(now, now), '방금');
});

test('getElapsed returns X분 전 within 1 hour', () => {
    const now = Date.UTC(2025, 0, 1, 12, 0, 0);
    assert.equal(getElapsed(now - 5 * 60_000, now), '5분 전');
    assert.equal(getElapsed(now - 59 * 60_000, now), '59분 전');
});

test('getElapsed returns X시간 전 within 24h', () => {
    const now = Date.UTC(2025, 0, 1, 12, 0, 0);
    assert.equal(getElapsed(now - 2 * 3600_000, now), '2시간 전');
    assert.equal(getElapsed(now - 23 * 3600_000, now), '23시간 전');
});

test('getElapsed returns X일 전 after 24h', () => {
    const now = Date.UTC(2025, 0, 2, 12, 0, 0);
    assert.equal(getElapsed(now - 24 * 3600_000, now), '1일 전');
    assert.equal(getElapsed(now - 72 * 3600_000, now), '3일 전');
});

test('USD_KRW_RATE constant exported as 1450', () => {
    assert.equal(USD_KRW_RATE, 1450);
});

test('formatKrw multiplies by USD_KRW_RATE and renders with 원', () => {
    assert.equal(formatKrw('1200'), '1,740,000원');
    assert.equal(formatKrw(1), '1,450원');
    assert.equal(formatKrw(0), '0원');
});

test('formatTickQtyTotal fixes to 4 decimals', () => {
    assert.equal(formatTickQtyTotal(0), '0.0000');
    assert.equal(formatTickQtyTotal(1.23456), '1.2346');
});
