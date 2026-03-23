// [AGENT] 단일 Binance WebSocket 스트림 연결/재연결 공통 클래스
// 연관파일: AggTradeStreamService.java(4개 인스턴스), BinanceStreamService.java, ForceOrderStreamService.java
// 핵심: 인스턴스별 독립 generation 관리 → 다중 스트림 운영 시 재연결 누락 방지
package com.chs.springboot.domain.binance.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.WebSocket;
import java.time.Duration;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

public class BinanceWebSocketStream {

    private static final Logger log = LoggerFactory.getLogger(BinanceWebSocketStream.class);

    @FunctionalInterface
    public interface MessageListener {
        void onMessage(String json);
    }

    private final String url;
    private final String logLabel;
    private final MessageListener listener;
    private final ScheduledExecutorService scheduler;
    private final long reconnectDelaySeconds;

    private volatile boolean running = true;
    private volatile int generation = 0;

    public BinanceWebSocketStream(String url, String logLabel, MessageListener listener,
                                   ScheduledExecutorService scheduler, long reconnectDelaySeconds) {
        this.url = url;
        this.logLabel = logLabel;
        this.listener = listener;
        this.scheduler = scheduler;
        this.reconnectDelaySeconds = reconnectDelaySeconds;
    }

    public void connect() {
        final int myGen = ++generation;
        scheduler.execute(() -> openStream(myGen));
    }

    public void disconnect() {
        running = false;
    }

    private void openStream(int myGen) {
        if (!running) return;
        try {
            log.info("[{}] 연결 시도 (gen={})", logLabel, myGen);
            HttpClient.newHttpClient()
                    .newWebSocketBuilder()
                    .connectTimeout(Duration.ofSeconds(10))
                    .buildAsync(URI.create(url), new WebSocket.Listener() {
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
                            if (myGen == generation) scheduleReconnect();
                            return null;
                        }

                        @Override
                        public void onError(WebSocket ws, Throwable error) {
                            log.error("[{}] 오류 (gen={}): {}", logLabel, myGen, error.getMessage());
                            if (myGen == generation) scheduleReconnect();
                        }
                    });
        } catch (Exception e) {
            log.error("[{}] 연결 오류: {}", logLabel, e.getMessage());
            scheduleReconnect();
        }
    }

    private void scheduleReconnect() {
        if (!running) return;
        scheduler.schedule(this::connect, reconnectDelaySeconds, TimeUnit.SECONDS);
    }
}
