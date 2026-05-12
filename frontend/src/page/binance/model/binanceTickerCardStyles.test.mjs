import test from 'node:test';
import assert from 'node:assert/strict';
import { getCoinTabTone } from './binanceTickerCardStyles.js';

test('getCoinTabTone preserves active and inactive color tokens', () => {
    assert.deepEqual(getCoinTabTone(true), {
        border: '1px solid var(--dark-accent-gold)',
        background: 'var(--dark-accent-gold)',
        color: '#000000',
        outline: '2px solid var(--dark-accent-gold)',
    });
    assert.deepEqual(getCoinTabTone(false), {
        border: '1px solid var(--dark-border)',
        background: 'transparent',
        color: 'var(--dark-text-primary)',
        outline: 'none',
    });
});
