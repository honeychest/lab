package com.chs.springboot.domain.binance.service.rawwriter;

import java.util.ArrayDeque;
import java.util.Deque;
import java.util.List;

final class AggTradeRawWriterFailureSampleBuffer {

    private final int maxSamples;
    private final Deque<AggTradeRawWriterKafkaFailureSample> recentFailures = new ArrayDeque<>();

    AggTradeRawWriterFailureSampleBuffer(int maxSamples) {
        this.maxSamples = maxSamples;
    }

    void add(AggTradeRawWriterKafkaFailureSample sample) {
        recentFailures.addFirst(sample);
        while (recentFailures.size() > maxSamples) {
            recentFailures.removeLast();
        }
    }

    List<AggTradeRawWriterKafkaFailureSample> snapshot() {
        return List.copyOf(recentFailures);
    }
}
