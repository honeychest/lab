package com.chs.springboot.domain.binance.service.rawwriter;

public record AggTradeRawWriterKafkaPartitionSnapshot(
        int partition,
        long latestOffset,
        Long committedOffset,
        Long lag
) {
}
