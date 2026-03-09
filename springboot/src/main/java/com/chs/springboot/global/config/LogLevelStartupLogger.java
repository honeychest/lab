// 서버 기동 시 적용 중인 로그 레벨 출력 (ERROR 레벨에서도 보이도록 log.error로 출력)
package com.chs.springboot.global.config;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.LoggerContext;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

@Component
public class LogLevelStartupLogger {

    private static final org.slf4j.Logger log = LoggerFactory.getLogger(LogLevelStartupLogger.class);
    private static final String BINANCE_TRADE_LOGGER_NAME = "com.chs.springboot.domain.binance.service.BinanceTradeService";

    @EventListener(ApplicationReadyEvent.class)
    public void onReady() {
        try {
            LoggerContext ctx = (LoggerContext) LoggerFactory.getILoggerFactory();
            Logger rootLogger = ctx.getLogger(Logger.ROOT_LOGGER_NAME);
            Logger binanceLogger = ctx.getLogger(BINANCE_TRADE_LOGGER_NAME);
            Level rootLevel = rootLogger.getEffectiveLevel();
            Level binanceLevel = binanceLogger.getEffectiveLevel();
            // ERROR 레벨에서도 보이도록 log.error 사용
            log.error("[시작] 로그 레벨 - root: {}, {}: {}", rootLevel, BINANCE_TRADE_LOGGER_NAME, binanceLevel);
        } catch (Exception e) {
            log.error("[시작] 로그 레벨 조회 실패: {}", e.getMessage());
        }
    }
}
