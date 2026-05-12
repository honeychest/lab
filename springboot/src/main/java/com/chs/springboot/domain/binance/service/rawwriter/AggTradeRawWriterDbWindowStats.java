package com.chs.springboot.domain.binance.service.rawwriter;

public record AggTradeRawWriterDbWindowStats(
        int count,
        Long minAggTradeId,
        Long maxAggTradeId,
        Long minTradedAt,
        Long maxTradedAt
) {
    public static AggTradeRawWriterDbWindowStats empty() {
        return new AggTradeRawWriterDbWindowStats(0, null, null, null, null);
    }
}

