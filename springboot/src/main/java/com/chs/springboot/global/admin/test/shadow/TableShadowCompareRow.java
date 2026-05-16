package com.chs.springboot.global.admin.test.shadow;

public record TableShadowCompareRow(
        String symbol,
        String marketType,
        long rawCount,
        long shadowCount,
        long countDelta,
        long rawDistinctSequenceCount,
        long shadowDistinctSequenceCount,
        long rawDuplicateCount,
        long shadowDuplicateCount,
        Long rawMinSequence,
        Long rawMaxSequence,
        Long shadowMinSequence,
        Long shadowMaxSequence,
        String status
) {
}
