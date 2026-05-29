package com.chs.springboot.domain.upbit.service;

import com.chs.springboot.domain.binance.service.NotificationService;
import com.chs.springboot.domain.upbit.websocket.UpbitPriceWebSocketHandler;
import com.chs.springboot.global.monitor.feed.FeedHealthConfig;
import com.chs.springboot.global.monitor.feed.FeedHealthRegistry;
import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.io.ByteArrayOutputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.List;
import java.util.concurrent.CompletionStage;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.stream.Collectors;

/**
 * Upbit upstream: always-on + full subscription.
 * Client sessions only receive messages for their requested codes.
 */
@Service
public class UpbitStreamService {

    private static final Logger log = LoggerFactory.getLogger(UpbitStreamService.class);

    private static final String UPBIT_STREAM_URL = "wss://api.upbit.com/websocket/v1";
    private static final int RECONNECT_DELAY_SEC = 3;

    private static final List<String> SUBSCRIBED_CODES = List.of(
            "KRW-BTC", "KRW-ETH", "KRW-SOL", "KRW-XRP", "KRW-USDT"
    );

    private final UpbitPriceWebSocketHandler handler;
    private final NotificationService notificationService;
    private final FeedHealthRegistry feedHealthRegistry;
    private final ScheduledExecutorService scheduler = Executors.newSingleThreadScheduledExecutor();
    private final HttpClient httpClient = HttpClient.newHttpClient();

    private volatile java.net.http.WebSocket upbitWs;
    private volatile boolean running = true;
    private final AtomicInteger connectionGeneration = new AtomicInteger(0);
    private final AtomicBoolean reconnectPending = new AtomicBoolean(false);

    public UpbitStreamService(UpbitPriceWebSocketHandler handler, NotificationService notificationService,
                              FeedHealthRegistry feedHealthRegistry) {
        this.handler = handler;
        this.notificationService = notificationService;
        this.feedHealthRegistry = feedHealthRegistry;
    }

    @PostConstruct
    public void connect() {
        connectToUpbit();
    }

    private void connectToUpbit() {
        if (!running) return;
        final int generation = connectionGeneration.incrementAndGet();
        reconnectPending.set(false);

        try {
            String subscribePayload = buildSubscribePayload();

            httpClient.newWebSocketBuilder()
                    .connectTimeout(Duration.ofSeconds(10))
                    .buildAsync(URI.create(UPBIT_STREAM_URL), new UpbitListener(generation))
                    .thenAccept(ws -> {
                        if (!running || generation != connectionGeneration.get()) {
                            try {
                                ws.sendClose(java.net.http.WebSocket.NORMAL_CLOSURE, "stale connection");
                            } catch (Exception ignored) {
                                // ignore
                            }
                            return;
                        }

                        upbitWs = ws;
                        ws.sendText(subscribePayload, true)
                                .exceptionally(e -> {
                                    log.error("[UpbitStream] subscribe send failed: {}", e.getMessage());
                                    scheduleReconnect();
                                    return null;
                                });

                        log.info("[UpbitStream] upstream connected with full codes: {}", SUBSCRIBED_CODES);
                    })
                    .exceptionally(e -> {
                        log.error("[UpbitStream] connect failed: {}", e.getMessage());
                        scheduleReconnect();
                        return null;
                    });
        } catch (Exception e) {
            log.error("[UpbitStream] connect error: {}", e.getMessage());
            scheduleReconnect();
        }
    }

    private void scheduleReconnect() {
        if (!running) return;
        if (!reconnectPending.compareAndSet(false, true)) return;
        scheduler.schedule(this::connectToUpbit, RECONNECT_DELAY_SEC, TimeUnit.SECONDS);
    }

    private String buildSubscribePayload() {
        String joinedCodes = SUBSCRIBED_CODES.stream()
                .map(code -> "\"" + code + "\"")
                .collect(Collectors.joining(","));

        return "[{\"ticket\":\"upbit-ticker-server\"},"
                + "{\"type\":\"ticker\",\"codes\":[" + joinedCodes + "]}]";
    }

    @PreDestroy
    public synchronized void disconnect() {
        running = false;
        scheduler.shutdownNow();

        if (upbitWs != null) {
            try {
                upbitWs.sendClose(java.net.http.WebSocket.NORMAL_CLOSURE, "shutdown");
            } catch (Exception ignored) {
                // ignore
            } finally {
                upbitWs = null;
            }
        }
    }

    private class UpbitListener implements java.net.http.WebSocket.Listener {

        private final int generation;
        private final StringBuilder textBuffer = new StringBuilder();
        private final ByteArrayOutputStream binaryBuffer = new ByteArrayOutputStream();

        private UpbitListener(int generation) {
            this.generation = generation;
        }

        @Override
        public void onOpen(java.net.http.WebSocket webSocket) {
            webSocket.request(1);
        }

        @Override
        public CompletionStage<?> onText(java.net.http.WebSocket ws, CharSequence data, boolean last) {
            textBuffer.append(data);
            if (last) {
                relay(textBuffer.toString());
                textBuffer.setLength(0);
            }
            ws.request(1);
            return null;
        }

        @Override
        public CompletionStage<?> onBinary(java.net.http.WebSocket ws, ByteBuffer data, boolean last) {
            byte[] chunk = new byte[data.remaining()];
            data.get(chunk);
            binaryBuffer.write(chunk, 0, chunk.length);

            if (last) {
                String json = binaryBuffer.toString(StandardCharsets.UTF_8);
                binaryBuffer.reset();
                relay(json);
            }

            ws.request(1);
            return null;
        }

        @Override
        public CompletionStage<?> onClose(java.net.http.WebSocket ws, int statusCode, String reason) {
            log.warn("[UpbitStream] upstream closed (generation={}, status={}): {}", generation, statusCode, reason);
            if (generation == connectionGeneration.get()) {
                scheduleReconnect();
            }
            return null;
        }

        @Override
        public void onError(java.net.http.WebSocket ws, Throwable error) {
            log.error("[UpbitStream] upstream error (generation={}): {}", generation, error.getMessage());
            if (generation == connectionGeneration.get()) {
                notificationService.sendAlert("[UpbitStream] error: " + error.getMessage());
                scheduleReconnect();
            }
        }

        private void relay(String json) {
            if (json == null || json.isEmpty()) return;
            feedHealthRegistry.markReceived(FeedHealthConfig.UPBIT);
            if (handler.getSessionCount() <= 0) return;
            handler.broadcastPrice(json);
        }
    }
}
