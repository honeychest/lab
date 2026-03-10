package com.chs.springboot.domain.binance.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

@Service
public class AggTradeFlushScheduler {

    private static final Logger log = LoggerFactory.getLogger(AggTradeFlushScheduler.class);

    private final AggTradeStorageService storageService;
    private final AggTradeConfigService configService;

    private volatile long lastFlushEpochSec = 0L;

    public AggTradeFlushScheduler(AggTradeStorageService storageService,
                                  AggTradeConfigService configService) {
        this.storageService = storageService;
        this.configService = configService;
    }

    @Scheduled(fixedRate = 1000L)
    public void tick() {
        long nowSec = System.currentTimeMillis() / 1000L;
        int interval = configService.getFlushIntervalSec();
        if (nowSec - lastFlushEpochSec < interval) {
            return;
        }
        storageService.getFlushExecutor().submit(() -> {
            storageService.doFlush();
            lastFlushEpochSec = System.currentTimeMillis() / 1000L;
        });
    }
}

