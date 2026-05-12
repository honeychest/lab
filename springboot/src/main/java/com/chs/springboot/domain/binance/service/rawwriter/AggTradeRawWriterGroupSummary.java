package com.chs.springboot.domain.binance.service.rawwriter;

public record AggTradeRawWriterGroupSummary(
        String symbol,
        String marketType,
        int count,
        Long minAggTradeId,
        Long maxAggTradeId,
        Long minTradedAt,
        Long maxTradedAt
) {
}

