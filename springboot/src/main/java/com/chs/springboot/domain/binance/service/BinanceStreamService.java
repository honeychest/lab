package com.chs.springboot.domain.binance.service;

import com.chs.springboot.domain.binance.websocket.BinancePriceWebSocketHandler;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.net.URI;
import java.net.http.HttpClient;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.CompletionStage;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.stream.Collectors;

/**
 * Binance upstream: always-on + full subscription.
 * Client sessions only receive messages for their requested symbol.
 */
@Service
public class BinanceStreamService {

    private static final Logger log = LoggerFactory.getLogger(BinanceStreamService.class);

    private static final List<String> SUBSCRIBED_SYMBOLS = List.of(
            "btcusdt", "ethusdt", "solusdt", "xrpusdt"
    );

    private static final String STREAM_BASE_URL = "wss://stream.binance.com:9443/stream?streams=";
    private static final int RECONNECT_DELAY_SEC = 3;

    private final BinancePriceWebSocketHandler handler;
    private final NotificationService notificationService;
    private final ScheduledExecutorService scheduler = Executors.newSingleThreadScheduledExecutor();
    private final ObjectMapper objectMapper = new ObjectMapper();

    private volatile java.net.http.WebSocket binanceWs;
    private volatile boolean running = true;
    private volatile int connectionGeneration = 0;
    private final AtomicBoolean reconnectPending = new AtomicBoolean(false);

    public BinanceStreamService(BinancePriceWebSocketHandler handler,
                                NotificationService notificationService) {
        this.handler = handler;
        this.notificationService = notificationService;
    }

    @PostConstruct
    public void connect() {
        connectToBinance();
    }

    private void connectToBinance() {
        if (!running) return;

        final int myGeneration = ++connectionGeneration;
        reconnectPending.set(false);

        try {
            String url = getStreamUrl();
            log.info("[BinanceStream] upstream connect try (generation={}, symbols={})", myGeneration, SUBSCRIBED_SYMBOLS);

            HttpClient.newHttpClient()
                    .newWebSocketBuilder()
                    .buildAsync(URI.create(url), new BinanceListener(myGeneration))
                    .thenAccept(ws -> {
                        this.binanceWs = ws;
                        log.info("[BinanceStream] upstream connected: {}", url);
                    })
                    .exceptionally(e -> {
                        log.error("[BinanceStream] connect failed: {}", e.getMessage());
                        scheduleReconnect();
                        return null;
                    });
        } catch (Exception e) {
            log.error("[BinanceStream] connect error: {}", e.getMessage());
            scheduleReconnect();
        }
    }

    private void scheduleReconnect() {
        if (!running) return;
        if (!reconnectPending.compareAndSet(false, true)) return;

        scheduler.schedule(() -> {
            reconnectPending.set(false);
            connectToBinance();
        }, RECONNECT_DELAY_SEC, TimeUnit.SECONDS);
    }

    private String getStreamUrl() {
        String streams = SUBSCRIBED_SYMBOLS.stream()
                .map(symbol -> symbol + "@ticker")
                .collect(Collectors.joining("/"));
        return STREAM_BASE_URL + streams;
    }

    @PreDestroy
    public void disconnect() {
        running = false;
        scheduler.shutdownNow();

        if (binanceWs != null) {
            binanceWs.sendClose(java.net.http.WebSocket.NORMAL_CLOSURE, "shutdown");
        }
    }

    private class BinanceListener implements java.net.http.WebSocket.Listener {

        private final int generation;
        private final StringBuilder buffer = new StringBuilder();

        private BinanceListener(int generation) {
            this.generation = generation;
        }

        @Override
        public CompletionStage<?> onText(java.net.http.WebSocket ws, CharSequence data, boolean last) {
            buffer.append(data);

            if (last) {
                if (handler.getSessionCount() > 0) {
                    relayBySessionSymbol(buffer.toString());
                }
                buffer.setLength(0);
            }

            ws.request(1);
            return null;
        }

        @Override
        public CompletionStage<?> onClose(java.net.http.WebSocket ws, int statusCode, String reason) {
            log.warn("[BinanceStream] upstream closed (generation={}, status={}): {}", generation, statusCode, reason);
            if (generation == connectionGeneration) {
                scheduleReconnect();
            }
            return null;
        }

        @Override
        public void onError(java.net.http.WebSocket ws, Throwable error) {
            log.error("[BinanceStream] upstream error (generation={}): {}", generation, error.getMessage());
            if (generation == connectionGeneration) {
                notificationService.sendAlert("[BinanceStream] error: " + error.getMessage());
                scheduleReconnect();
            }
        }

        private void relayBySessionSymbol(String json) {
            try {
                JsonNode root = objectMapper.readTree(json);

                JsonNode payloadNode = root.path("data");
                JsonNode tickerNode = payloadNode.isMissingNode() ? root : payloadNode;

                String symbol = tickerNode.path("s").asText(null);
                if (symbol == null || symbol.isBlank()) return;

                String payload = payloadNode.isMissingNode() ? json : payloadNode.toString();
                handler.broadcastPrice(payload, symbol.toUpperCase(Locale.ROOT));
            } catch (Exception ignored) {
                // Ignore malformed frames.
            }
        }
    }
}
