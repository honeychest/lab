package com.chs.springboot.domain.binance.service.rawwriter;

public record AggTradeRawWriterKafkaFailureSample(
        long occurredAtMs,
        String failureType,
        String symbol,
        String marketType,
        Integer partition,
        Long offset,
        String errorMessage
) {
}
