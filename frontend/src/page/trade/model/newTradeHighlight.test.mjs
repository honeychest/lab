import test from 'node:test';
import assert from 'node:assert/strict';
import { detectNewFirstId, HIGHLIGHT_DURATION_MS } from './newTradeHighlight.js';

test('returns null on initial mount (prevFirstId is null)', () => {
    assert.equal(detectNewFirstId(null, 'a'), null);
    assert.equal(detectNewFirstId(null, null), null);
});

test('returns null when firstId is unchanged', () => {
    assert.equal(detectNewFirstId('a', 'a'), null);
});

test('returns null when current firstId is nullish (no trades)', () => {
    assert.equal(detectNewFirstId('a', null), null);
    assert.equal(detectNewFirstId('a', undefined), null);
});

test('returns current firstId when it changes from a known previous id', () => {
    assert.equal(detectNewFirstId('a', 'b'), 'b');
    assert.equal(detectNewFirstId(1, 2), 2);
});

test('HIGHLIGHT_DURATION_MS is 500ms (locked from original behavior)', () => {
    assert.equal(HIGHLIGHT_DURATION_MS, 500);
});
