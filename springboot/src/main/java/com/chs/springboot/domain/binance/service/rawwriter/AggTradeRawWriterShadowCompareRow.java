package com.chs.springboot.domain.binance.service.rawwriter;

public record AggTradeRawWriterShadowCompareRow(
        String symbol,
        String marketType,
        long rawCount,
        long shadowCount,
        long countDelta,
        Long rawMinAggTradeId,
        Long rawMaxAggTradeId,
        Long shadowMinAggTradeId,
        Long shadowMaxAggTradeId,
        String status
) {
}
