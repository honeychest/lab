package com.chs.springboot.domain.binance.service.rawwriter;

public record AggTradeRawWriterInvalidMessage(
        AggTradeRawWriterMessage message,
        InvalidAggTradeRawMessageException error
) {
}
