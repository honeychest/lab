package com.chs.springboot.domain.binance.service.rawwriter;

public record AggTradeRawWriterKafkaWindowEvent(
        String symbol,
        String marketType,
        long tradedAt,
        long aggTradeId,
        int invalidCount
) {
}

