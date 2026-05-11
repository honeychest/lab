package com.chs.springboot.domain.binance.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

@Component
public class AggTradeStorageSink implements AggTradeSink {

    private static final Logger log = LoggerFactory.getLogger(AggTradeStorageSink.class);

    private final AggTradeStorageService storageService;

    public AggTradeStorageSink(AggTradeStorageService storageService) {
        this.storageService = storageService;
    }

    @Override
    public void accept(AggTradeEvent event) {
        try {
            storageService.enqueue(event.rawJson(), event.symbol(), event.marketType());
        } catch (Exception e) {
            log.error("[AggTradeStorageSink] enqueue 실패 {} {} error={}",
                    event.symbol(), event.marketType(), e.getMessage());
        }
    }
}
