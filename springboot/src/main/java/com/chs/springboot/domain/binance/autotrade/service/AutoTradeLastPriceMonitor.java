package com.chs.springboot.domain.binance.autotrade.service;

import com.chs.springboot.domain.binance.autotrade.leader.AutoTradeExecutionRouteKind;
import com.chs.springboot.domain.binance.autotrade.leader.AutoTradeExecutionRouter;
import com.chs.springboot.domain.binance.autotrade.model.AutoTradePriceSnapshot;
import com.chs.springboot.domain.binance.autotrade.model.AutoTradePriceTick;
import com.chs.springboot.domain.binance.autotrade.model.AutoTradeBookTicker;
import com.chs.springboot.domain.binance.service.BinanceWebSocketStream;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.util.Optional;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.atomic.AtomicReference;

@Slf4j
@Service
public class AutoTradeLastPriceMonitor {

    private final AutoTradeConfigService configService;
    private final AutoTradeExecutionRouter executionRouter;
    private final ObjectMapper objectMapper;
    private final String futuresWebSocketBaseUrl;
    private final ScheduledExecutorService scheduler = Executors.newSingleThreadScheduledExecutor(runnable -> {
        Thread thread = new Thread(runnable, "binance-autotrade-price");
        thread.setDaemon(true);
        return thread;
    });
    private final AtomicReference<AutoTradePriceSnapshot> latest = new AtomicReference<>();
    private final AtomicReference<AutoTradeBookTicker> latestQuote = new AtomicReference<>();

    private volatile BinanceWebSocketStream stream;
    private volatile String subscribedSymbol;
    private volatile String latestSymbol;
    private volatile long subscriptionGeneration;
    private volatile BinanceWebSocketStream quoteStream;
    private volatile String quoteSubscribedSymbol;
    private volatile long quoteSubscriptionGeneration;

    public AutoTradeLastPriceMonitor(
            AutoTradeConfigService configService,
            AutoTradeExecutionRouter executionRouter,
            ObjectMapper objectMapper,
            @Value("${binance.autotrade.futures-ws-base-url:wss://fstream.binance.com/ws/}") String futuresWebSocketBaseUrl) {
        this.configService = configService;
        this.executionRouter = executionRouter;
        this.objectMapper = objectMapper;
        this.futuresWebSocketBaseUrl = futuresWebSocketBaseUrl;
    }

    @PostConstruct
    public void start() {
        scheduler.scheduleWithFixedDelay(this::refreshConfiguration, 0, 1_000L, java.util.concurrent.TimeUnit.MILLISECONDS);
    }

    public synchronized void ensureCurrentSymbol() {
        if (executionRouter.route().kind() != AutoTradeExecutionRouteKind.EXECUTE_HERE) {
            disconnectCurrent();
            return;
        }
        String symbol = configService.current().symbol().toLowerCase();
        if (stream != null && symbol.equals(subscribedSymbol)) {
            return;
        }
        disconnectCurrent();
        long generation = subscriptionGeneration;
        String url = futuresWebSocketBaseUrl + symbol + "@trade";
        stream = new BinanceWebSocketStream(url, "AutoTradePrice/" + symbol,
                json -> accept(json, symbol, generation), scheduler, 5);
        subscribedSymbol = symbol;
        stream.onError(error -> clearIfCurrent(generation, error));
        stream.connect();
        long quoteGeneration = quoteSubscriptionGeneration;
        String quoteUrl = futuresWebSocketBaseUrl + symbol + "@bookTicker";
        quoteStream = new BinanceWebSocketStream(quoteUrl, "AutoTradeBookTicker/" + symbol,
                json -> acceptQuote(json, symbol, quoteGeneration), scheduler, 5);
        quoteSubscribedSymbol = symbol;
        quoteStream.onError(error -> clearQuoteIfCurrent(quoteGeneration, error));
        quoteStream.connect();
        log.info("[AutoTradePrice] {} 선물 마지막 체결가 감시 시작", symbol.toUpperCase());
    }

    public Optional<AutoTradePriceSnapshot> latest() {
        return Optional.ofNullable(latest.get());
    }

    public String latestPriceSymbol() {
        String symbol = latestSymbol;
        return symbol == null ? null : symbol.toUpperCase();
    }

    public Optional<AutoTradeBookTicker> latestQuote() {
        return Optional.ofNullable(latestQuote.get());
    }

    private synchronized void accept(String json, String symbol, long generation) {
        if (generation != subscriptionGeneration || !symbol.equals(subscribedSymbol)) {
            return;
        }
        try {
            AutoTradePriceTick tick = AutoTradeLastPriceParser.parse(json, objectMapper);
            latestSymbol = symbol;
            latest.set(new AutoTradePriceSnapshot(tick.price(), null));
        } catch (RuntimeException e) {
            log.debug("[AutoTradePrice] 가격 이벤트 무시: {}", e.getMessage());
        }
    }

    private synchronized void acceptQuote(String json, String symbol, long generation) {
        if (generation != quoteSubscriptionGeneration || !symbol.equals(quoteSubscribedSymbol)) {
            return;
        }
        try {
            latestQuote.set(AutoTradeBookTickerParser.parse(json, objectMapper));
        } catch (RuntimeException e) {
            log.debug("[AutoTradePrice] 호가 이벤트 무시: {}", e.getMessage());
        }
    }

    @PreDestroy
    public synchronized void stop() {
        disconnectCurrent();
        scheduler.shutdownNow();
    }

    private void disconnectCurrent() {
        subscriptionGeneration++;
        quoteSubscriptionGeneration++;
        BinanceWebSocketStream current = stream;
        BinanceWebSocketStream currentQuoteStream = quoteStream;
        stream = null;
        subscribedSymbol = null;
        latest.set(null);
        latestSymbol = null;
        quoteStream = null;
        quoteSubscribedSymbol = null;
        latestQuote.set(null);
        if (current != null) {
            current.disconnect();
        }
        if (currentQuoteStream != null) {
            currentQuoteStream.disconnect();
        }
    }

    private synchronized void clearIfCurrent(long generation, Throwable error) {
        if (generation != subscriptionGeneration) {
            return;
        }
        latest.set(null);
        latestSymbol = null;
        log.warn("[AutoTradePrice] stream 오류: {}", error.getMessage());
    }

    private synchronized void clearQuoteIfCurrent(long generation, Throwable error) {
        if (generation != quoteSubscriptionGeneration) {
            return;
        }
        latestQuote.set(null);
        log.warn("[AutoTradePrice] 호가 stream 오류: {}", error.getMessage());
    }

    private void refreshConfiguration() {
        try {
            ensureCurrentSymbol();
        } catch (RuntimeException e) {
            log.warn("[AutoTradePrice] 가격 감시 설정 갱신 실패: {}", e.getMessage());
        }
    }
}
