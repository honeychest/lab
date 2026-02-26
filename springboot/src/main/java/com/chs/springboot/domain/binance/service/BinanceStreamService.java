// Purpose: 바이낸스 WebSocket 스트림 구독 — 실시간 시세를 프론트엔드 클라이언트로 중계
package com.chs.springboot.domain.binance.service;

import com.chs.springboot.domain.binance.websocket.BinancePriceWebSocketHandler;
import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.net.URI;
import java.net.http.HttpClient;
import java.util.concurrent.CompletionStage;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

@Service
public class BinanceStreamService {

    private static final Logger log = LoggerFactory.getLogger(BinanceStreamService.class);
    private static final String BINANCE_STREAM_URL = "wss://stream.binance.com:9443/ws/btcusdt@ticker";
    private static final int RECONNECT_DELAY_SEC = 3;

    private final BinancePriceWebSocketHandler handler;
    private final NotificationService notificationService;
    private final ScheduledExecutorService scheduler = Executors.newSingleThreadScheduledExecutor();

    private java.net.http.WebSocket binanceWs;
    private volatile boolean running = true;

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
        try {
            HttpClient.newHttpClient()
                    .newWebSocketBuilder()
                    .buildAsync(URI.create(BINANCE_STREAM_URL), new BinanceListener())
                    .thenAccept(ws -> {
                        this.binanceWs = ws;
                        log.info("[BinanceStream] 바이낸스 WebSocket 연결 성공");
                    })
                    .exceptionally(e -> {
                        log.error("[BinanceStream] 연결 실패: {}", e.getMessage());
                        scheduleReconnect();
                        return null;
                    });
        } catch (Exception e) {
            log.error("[BinanceStream] 연결 오류: {}", e.getMessage());
            scheduleReconnect();
        }
    }

    private void scheduleReconnect() {
        if (!running) return;
        log.info("[BinanceStream] {}초 후 재연결 시도", RECONNECT_DELAY_SEC);
        scheduler.schedule(this::connectToBinance, RECONNECT_DELAY_SEC, TimeUnit.SECONDS);
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

        private final StringBuilder buffer = new StringBuilder();

        @Override
        public CompletionStage<?> onText(java.net.http.WebSocket ws, CharSequence data, boolean last) {
            buffer.append(data);
            if (last) {
                // 세션이 있을 때만 브로드캐스트 (불필요한 작업 방지)
                if (handler.getSessionCount() > 0) {
                    handler.broadcastPrice(buffer.toString());
                }
                buffer.setLength(0);
            }
            ws.request(1);
            return null;
        }

        @Override
        public CompletionStage<?> onClose(java.net.http.WebSocket ws, int statusCode, String reason) {
            log.warn("[BinanceStream] 연결 종료 ({}): {}", statusCode, reason);
            scheduleReconnect();
            return null;
        }

        @Override
        public void onError(java.net.http.WebSocket ws, Throwable error) {
            log.error("[BinanceStream] 스트림 오류: {}", error.getMessage());
            notificationService.sendAlert("[BinanceStream] 오류: " + error.getMessage());
            scheduleReconnect();
        }
    }
}
