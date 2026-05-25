package com.chs.springboot.domain.binance.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.WebSocket;
import java.time.Duration;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;

public class BinanceWebSocketStream {

    private static final Logger log = LoggerFactory.getLogger(BinanceWebSocketStream.class);
    private static final WebSocketConnector SHARED_CONNECTOR = createSharedConnector();

    @FunctionalInterface
    public interface MessageListener {
        void onMessage(String json);
    }

    @FunctionalInterface
    public interface WebSocketConnector {
        CompletableFuture<WebSocket> connect(URI uri, WebSocket.Listener listener);
    }

    private final String url;
    private final String logLabel;
    private final MessageListener listener;
    private final ScheduledExecutorService scheduler;
    private final long reconnectDelaySeconds;
    private final WebSocketConnector connector;

    private volatile boolean running = true;
    private final AtomicInteger generation = new AtomicInteger(0);
    private final AtomicBoolean reconnectPending = new AtomicBoolean(false);
    private volatile WebSocket webSocket;

    public BinanceWebSocketStream(String url, String logLabel, MessageListener listener,
                                   ScheduledExecutorService scheduler, long reconnectDelaySeconds) {
        this(url, logLabel, listener, scheduler, reconnectDelaySeconds, SHARED_CONNECTOR);
    }

    public BinanceWebSocketStream(String url, String logLabel, MessageListener listener,
                                   ScheduledExecutorService scheduler, long reconnectDelaySeconds,
                                   WebSocketConnector connector) {
        this.url = url;
        this.logLabel = logLabel;
        this.listener = listener;
        this.scheduler = scheduler;
        this.reconnectDelaySeconds = reconnectDelaySeconds;
        this.connector = connector;
    }

    public void connect() {
        final int myGen = generation.incrementAndGet();
        reconnectPending.set(false);
        scheduler.execute(() -> openStream(myGen));
    }

    public void disconnect() {
        running = false;
        WebSocket currentWebSocket = webSocket;
        if (currentWebSocket != null) {
            try {
                currentWebSocket.sendClose(WebSocket.NORMAL_CLOSURE, "shutdown");
            } catch (Exception e) {
                log.warn("[{}] 웹소켓 종료 실패: {}", logLabel, e.getMessage());
            }
        }
    }

    private void openStream(int myGen) {
        if (!running) return;
        try {
            log.info("[{}] 연결 시도 (gen={})", logLabel, myGen);
            connector.connect(URI.create(url), new WebSocket.Listener() {
                        @Override
                        public void onOpen(WebSocket ws) {
                            webSocket = ws;
                            log.info("[{}] 연결 성공 (gen={})", logLabel, myGen);
                            ws.request(1);
                            WebSocket.Listener.super.onOpen(ws);
                        }

                        private final StringBuilder buffer = new StringBuilder();

                        @Override
                        public java.util.concurrent.CompletionStage<?> onText(WebSocket ws, CharSequence data, boolean last) {
                            buffer.append(data);
                            if (last) {
                                String json = buffer.toString();
                                buffer.setLength(0);
                                try {
                                    listener.onMessage(json);
                                } catch (Exception e) {
                                    log.warn("[{}] 메시지 처리 실패: {}", logLabel, e.getMessage());
                                }
                            }
                            ws.request(1);
                            return null;
                        }

                        @Override
                        public java.util.concurrent.CompletionStage<?> onClose(WebSocket ws, int statusCode, String reason) {
                            log.warn("[{}] 종료 (gen={}, status={}): {}", logLabel, myGen, statusCode, reason);
                            if (myGen == generation.get()) scheduleReconnect();
                            return null;
                        }

                        @Override
                        public void onError(WebSocket ws, Throwable error) {
                            log.error("[{}] 오류 (gen={}): {}", logLabel, myGen, error.getMessage());
                            if (myGen == generation.get()) scheduleReconnect();
                        }
                    })
                    .whenComplete((ws, error) -> {
                        if (error != null) {
                            log.error("[{}] handshake 실패 (gen={}): {}", logLabel, myGen, error.getMessage());
                            if (myGen == generation.get()) {
                                scheduleReconnect();
                            }
                        }
                    });
        } catch (Exception e) {
            log.error("[{}] 연결 오류: {}", logLabel, e.getMessage());
            if (myGen == generation.get()) scheduleReconnect();
        }
    }

    private void scheduleReconnect() {
        if (!running) return;
        if (!reconnectPending.compareAndSet(false, true)) return;
        scheduler.schedule(this::connect, reconnectDelaySeconds, TimeUnit.SECONDS);
    }

    private static WebSocketConnector createSharedConnector() {
        HttpClient client = HttpClient.newHttpClient();
        return (uri, listener) -> client.newWebSocketBuilder()
                .connectTimeout(Duration.ofSeconds(10))
                .buildAsync(uri, listener);
    }
}
