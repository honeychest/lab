package com.chs.springboot.domain.binance.autotrade.service;

import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

@Slf4j
@Service
public class AutoTradeExecutionLoop {

    private static final long SCHEDULER_TICK_MS = 250L;

    private final AutoTradeExecutionCoordinator coordinator;
    private final ScheduledExecutorService scheduler = Executors.newSingleThreadScheduledExecutor(runnable -> {
        Thread thread = new Thread(runnable, "binance-autotrade-execution");
        thread.setDaemon(true);
        return thread;
    });

    public AutoTradeExecutionLoop(
            AutoTradeExecutionCoordinator coordinator) {
        this.coordinator = coordinator;
    }

    @PostConstruct
    public void start() {
        scheduler.scheduleWithFixedDelay(this::runOnce, 0, SCHEDULER_TICK_MS, TimeUnit.MILLISECONDS);
        log.info("[AutoTrade] 설정 기반 실행 루프를 시작했습니다: tick={}ms", SCHEDULER_TICK_MS);
    }

    private void runOnce() {
        try {
            coordinator.runScheduledOnce();
        } catch (RuntimeException e) {
            log.warn("[AutoTrade] 실행 루프 오류: {}", e.getMessage());
        }
    }

    @PreDestroy
    public void stop() {
        scheduler.shutdownNow();
    }
}
