package com.chs.springboot.domain.binance.autotrade.service;

import com.chs.springboot.domain.binance.analysis.BinanceAnalysisTools;
import com.chs.springboot.domain.binance.autotrade.model.AutoTradeEntryDecision;
import com.chs.springboot.domain.binance.autotrade.model.AutoTradePriceSnapshot;
import com.chs.springboot.domain.binance.model.MultiTimeframeMarketSnapshot;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import jakarta.annotation.PreDestroy;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;

@Service
public class AutoTradeEntryDecisionService {

    private final AutoTradeConfigService configService;
    private final AutoTradeMarketSnapshotService snapshotService;
    private final AutoTradeLastPriceMonitor priceMonitor;
    private final ChatClient chatClient;
    private final ObjectMapper objectMapper;
    private final long timeoutMs;
    private final ExecutorService executor = Executors.newSingleThreadExecutor(runnable -> {
        Thread thread = new Thread(runnable, "binance-autotrade-entry-llm");
        thread.setDaemon(true);
        return thread;
    });

    public AutoTradeEntryDecisionService(
            AutoTradeConfigService configService,
            AutoTradeMarketSnapshotService snapshotService,
            AutoTradeLastPriceMonitor priceMonitor,
            @Qualifier("autoTradeChatClient") ChatClient chatClient,
            ObjectMapper objectMapper,
            @Value("${binance.autotrade.entry-llm-timeout-ms:30000}") long timeoutMs) {
        this.configService = configService;
        this.snapshotService = snapshotService;
        this.priceMonitor = priceMonitor;
        this.chatClient = chatClient;
        this.objectMapper = objectMapper;
        this.timeoutMs = Math.max(timeoutMs, 1_000L);
    }

    public AutoTradeEntryDecision decide() {
        AutoTradePriceSnapshot livePrice = priceMonitor.latest().orElse(null);
        if (livePrice == null) {
            return AutoTradeEntryDecision.noTrade("실시간 가격이 아직 준비되지 않았습니다");
        }
        Future<AutoTradeEntryDecision> future = executor.submit(this::decideFromSnapshot);
        try {
            return future.get(timeoutMs, TimeUnit.MILLISECONDS);
        } catch (TimeoutException e) {
            future.cancel(true);
            return AutoTradeEntryDecision.noTrade("진입 분석 시간이 초과되었습니다");
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            future.cancel(true);
            return AutoTradeEntryDecision.noTrade("진입 분석이 중단되었습니다");
        } catch (ExecutionException e) {
            return AutoTradeEntryDecision.noTrade("진입 분석 중 오류가 발생했습니다");
        }
    }

    private AutoTradeEntryDecision decideFromSnapshot() {
        try {
            AutoTradePriceSnapshot livePrice = priceMonitor.latest().orElse(null);
            if (livePrice == null) {
                return AutoTradeEntryDecision.noTrade("실시간 가격이 아직 준비되지 않았습니다");
            }
            MultiTimeframeMarketSnapshot snapshot = snapshotService.capture(configService.current().symbol());
            if (!snapshot.analysisAvailable()) {
                return AutoTradeEntryDecision.noTrade("5분봉·15분봉·4시간봉·일봉 분석 데이터가 준비되지 않았습니다");
            }
            String content = chatClient.prompt()
                    .user("""
                            선택 심볼: %s
                            현재 실시간 마지막 체결가: %s
                            데이터 기준 시각(asOfMs): %s
                            다음 스냅샷을 바탕으로 최초 진입 방향만 판단하라.
                            필요한 원본 4시간봉·일봉은 읽기 전용 툴로 확인할 수 있다.

                            [스냅샷]
                            %s
                            """.formatted(snapshot.symbol(), livePrice.lastPrice(), snapshot.asOfMs(), snapshot.overview()))
                    .toolCallbacks(new BinanceAnalysisTools(snapshot).limitedCallbacks(5))
                    .call()
                    .content();
            return AutoTradeEntryDecisionParser.parse(content, objectMapper);
        } catch (Exception e) {
            return AutoTradeEntryDecision.noTrade("진입 분석 중 오류가 발생했습니다");
        }
    }

    @PreDestroy
    public void stop() {
        executor.shutdownNow();
    }
}
