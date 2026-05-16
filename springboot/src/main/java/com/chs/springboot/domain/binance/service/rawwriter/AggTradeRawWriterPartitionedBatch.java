package com.chs.springboot.domain.binance.service.rawwriter;

import java.util.List;

public record AggTradeRawWriterPartitionedBatch(
        List<AggTradeRawWriterParsedMessage> validMessages,
        List<AggTradeRawWriterInvalidMessage> invalidMessages
) {
    public boolean hasInvalidMessages() {
        return !invalidMessages.isEmpty();
    }

    public boolean hasValidMessages() {
        return !validMessages.isEmpty();
    }
}
