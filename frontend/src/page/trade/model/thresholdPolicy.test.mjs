import test from 'node:test';
import assert from 'node:assert/strict';
import {
    mapThresholdResponse,
    composeCanEdit,
} from './thresholdPolicy.js';

test('mapThresholdResponse: full payload', () => {
    assert.deepEqual(
        mapThresholdResponse({ value: 1_000_000, canEdit: true }),
        { value: 1_000_000, canEdit: true },
    );
});

test('mapThresholdResponse: missing value → null, missing canEdit → false', () => {
    assert.deepEqual(mapThresholdResponse({}), { value: null, canEdit: false });
});

test('mapThresholdResponse: nullish payload defaults', () => {
    assert.deepEqual(mapThresholdResponse(null), { value: null, canEdit: false });
    assert.deepEqual(mapThresholdResponse(undefined), { value: null, canEdit: false });
});

test('mapThresholdResponse: canEdit coerced to boolean', () => {
    assert.equal(mapThresholdResponse({ canEdit: 1 }).canEdit, true);
    assert.equal(mapThresholdResponse({ canEdit: 0 }).canEdit, false);
    assert.equal(mapThresholdResponse({ canEdit: 'true' }).canEdit, true);
});

test('mapThresholdResponse: value 0 preserved (not coerced to null)', () => {
    assert.equal(mapThresholdResponse({ value: 0 }).value, 0);
});

test('composeCanEdit: requires both flags true', () => {
    assert.equal(composeCanEdit(true, true), true);
    assert.equal(composeCanEdit(true, false), false);
    assert.equal(composeCanEdit(false, true), false);
    assert.equal(composeCanEdit(false, false), false);
});

test('composeCanEdit: coerces non-boolean inputs', () => {
    assert.equal(composeCanEdit(1, 1), true);
    assert.equal(composeCanEdit(null, true), false);
    assert.equal(composeCanEdit(undefined, undefined), false);
});
