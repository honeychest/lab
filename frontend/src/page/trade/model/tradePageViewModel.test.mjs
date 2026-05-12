import test from 'node:test';
import assert from 'node:assert/strict';
import { getTradeSymbol, getScanSlotView } from './tradePageViewModel.js';

test('getTradeSymbol renders first trade base asset', () => {
    assert.equal(getTradeSymbol([{ symbol: 'BTCUSDT' }]), 'BTC');
    assert.equal(getTradeSymbol([{ symbol: 'ETHUSDT' }]), 'ETH');
});

test('getTradeSymbol falls back to BTC when trades are empty', () => {
    assert.equal(getTradeSymbol([]), 'BTC');
    assert.equal(getTradeSymbol(null), 'BTC');
});

test('getScanSlotView describes reconnecting state', () => {
    assert.deepEqual(getScanSlotView('reconnecting'), {
        isExpanding: false,
        isReconnecting: true,
        label: '재연결 중...',
        showThreshold: false,
        showBeam: false,
    });
});

test('getScanSlotView describes expanding state', () => {
    assert.deepEqual(getScanSlotView('expanding'), {
        isExpanding: true,
        isReconnecting: false,
        label: '● 체결 감지',
        showThreshold: false,
        showBeam: false,
    });
});

test('getScanSlotView describes idle scan state', () => {
    assert.deepEqual(getScanSlotView('idle'), {
        isExpanding: false,
        isReconnecting: false,
        label: '○ 감시중',
        showThreshold: true,
        showBeam: true,
    });
});
