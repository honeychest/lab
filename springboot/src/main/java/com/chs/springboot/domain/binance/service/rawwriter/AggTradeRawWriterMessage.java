package com.chs.springboot.domain.binance.service.rawwriter;

public record AggTradeRawWriterMessage(
        String topic,
        Integer partition,
        Long offset,
        String key,
        String value
) {
}

