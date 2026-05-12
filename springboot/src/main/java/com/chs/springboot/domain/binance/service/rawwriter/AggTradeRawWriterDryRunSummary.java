package com.chs.springboot.domain.binance.service.rawwriter;

import java.util.List;

public record AggTradeRawWriterDryRunSummary(
        String id,
        long windowStartMs,
        long windowEndMs,
        String symbol,
        String marketType,
        int kafkaCount,
        int dbCount,
        Long kafkaMinAggTradeId,
        Long kafkaMaxAggTradeId,
        Long dbMinAggTradeId,
        Long dbMaxAggTradeId,
        Long kafkaMinTradedAt,
        Long kafkaMaxTradedAt,
        Long dbMinTradedAt,
        Long dbMaxTradedAt,
        int invalidCount,
        List<Long> sampleAggTradeIds,
        boolean countMatched,
        boolean rangeMatched,
        boolean partialWindow,
        String comparisonStatus
) {
}
