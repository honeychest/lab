import test from 'node:test';
import assert from 'node:assert/strict';
import { buildBinanceLiveStatus } from './binanceLiveStatus.js';

test('buildBinanceLiveStatus enables blink only for connected live data without reduced motion', () => {
    const status = buildBinanceLiveStatus({
        status: 'connected',
        ticker: { E: 123 },
        prefersReducedMotion: false,
    });

    assert.deepEqual(status, {
        color: '#2ecc71',
        text: 'LIVE',
        fill: '#2ecc71',
        blink: true,
        transition: 'background-color 0.15s ease-out',
    });
});

test('buildBinanceLiveStatus falls back to disconnected display', () => {
    const status = buildBinanceLiveStatus({
        status: undefined,
        ticker: null,
        prefersReducedMotion: true,
    });

    assert.deepEqual(status, {
        color: '#e74c3c',
        text: '연결 끊김',
        fill: 'transparent',
        blink: false,
        transition: 'none',
    });
});
