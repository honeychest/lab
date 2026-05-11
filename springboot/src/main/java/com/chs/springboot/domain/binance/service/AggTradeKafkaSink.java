package com.chs.springboot.domain.binance.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

@Component
public class AggTradeKafkaSink implements AggTradeSink {

    private static final Logger log = LoggerFactory.getLogger(AggTradeKafkaSink.class);

    private final AggTradeKafkaProducer kafkaProducer;

    public AggTradeKafkaSink(AggTradeKafkaProducer kafkaProducer) {
        this.kafkaProducer = kafkaProducer;
    }

    @Override
    public void accept(AggTradeEvent event) {
        try {
            kafkaProducer.publishRaw(event.rawJson(), event.symbol(), event.marketType(), event.receivedAt());
        } catch (Exception e) {
            log.error("[AggTradeKafkaSink] publish 실패 {} {} error={}",
                    event.symbol(), event.marketType(), e.getMessage());
        }
    }
}
