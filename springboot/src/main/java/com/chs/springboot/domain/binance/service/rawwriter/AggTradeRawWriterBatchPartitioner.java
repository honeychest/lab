package com.chs.springboot.domain.binance.service.rawwriter;

import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;

@Component
public class AggTradeRawWriterBatchPartitioner {

    private final AggTradeRawWriterMessageParser parser;

    public AggTradeRawWriterBatchPartitioner(AggTradeRawWriterMessageParser parser) {
        this.parser = parser;
    }

    public AggTradeRawWriterPartitionedBatch partition(List<AggTradeRawWriterMessage> messages) {
        List<AggTradeRawWriterParsedMessage> validMessages = new ArrayList<>();
        List<AggTradeRawWriterInvalidMessage> invalidMessages = new ArrayList<>();
        for (AggTradeRawWriterMessage message : messages) {
            try {
                validMessages.add(parser.parse(message));
            } catch (InvalidAggTradeRawMessageException e) {
                invalidMessages.add(new AggTradeRawWriterInvalidMessage(message, e));
            }
        }
        return new AggTradeRawWriterPartitionedBatch(
                List.copyOf(validMessages),
                List.copyOf(invalidMessages)
        );
    }
}
