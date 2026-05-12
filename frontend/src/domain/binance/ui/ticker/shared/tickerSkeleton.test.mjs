import test from 'node:test';
import assert from 'node:assert/strict';
import { getTickerSkeletonAnimationName } from './tickerSkeleton.js';

test('getTickerSkeletonAnimationName preserves desktop/mobile shimmer names', () => {
    assert.equal(getTickerSkeletonAnimationName('desktop'), 'shimmer');
    assert.equal(getTickerSkeletonAnimationName('mobile'), 'shimmerMobile');
});
