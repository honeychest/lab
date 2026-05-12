import test from 'node:test';
import assert from 'node:assert/strict';
import { getTickerPanelMinimumSize } from './tickerPanelStability.js';

test('getTickerPanelMinimumSize preserves saved dimensions while ticker reloads', () => {
    assert.deepEqual(
        getTickerPanelMinimumSize({
            ticker: null,
            savedHeight: 320,
            savedWidth: 640,
        }),
        {
            minHeight: '320px',
            minWidth: '640px',
        },
    );
});

test('getTickerPanelMinimumSize releases constraints when ticker exists', () => {
    assert.deepEqual(
        getTickerPanelMinimumSize({
            ticker: { c: '100' },
            savedHeight: 320,
            savedWidth: 640,
        }),
        {
            minHeight: undefined,
            minWidth: undefined,
        },
    );
});
