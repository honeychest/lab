package com.chs.springboot.domain.binance.service.rawwriter;

import java.util.List;

public record AggTradeRawWriterKafkaTopicSnapshot(
        String topic,
        Integer partitionCount,
        Long latestOffsetSum,
        Long committedOffsetSum,
        Long lagSum,
        String errorMessage,
        List<AggTradeRawWriterKafkaPartitionSnapshot> partitions
) {
}
