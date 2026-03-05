// [AGENT] 역할: 업비트 단일 WS 연결 유지 및 다중 코드 구독 중계 서비스 | 연관파일: UpbitPriceWebSocketHandler.java, NotificationService.java, UpbitSubscriptionChangeEvent.java | 주요메서드: handleSubscriptionChange()(@EventListener), applyRequestedCodes(), connectToUpbit(), scheduleReconnect(), disconnect()(@PreDestroy) | 핵심: connectionGeneration으로 구 리스너 재연결 무효화, 텍스트/바이너리 수신 모두 처리
// Purpose: 업비트 단일 WebSocket 연결 유지 및 다중 코드 구독 중계 서비스

package com.chs.springboot.domain.upbit.service;

import com.chs.springboot.domain.binance.service.NotificationService;
import com.chs.springboot.domain.upbit.websocket.UpbitPriceWebSocketHandler;
import jakarta.annotation.PreDestroy;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Service;

import java.io.ByteArrayOutputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
import java.util.LinkedHashSet;
import java.util.Set;
import java.util.concurrent.CompletionStage;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.stream.Collectors;

/**
 * 동작 개요:
 * - 프론트 세션들의 codes 합집합(이벤트)을 수신
 * - 업비트 상위 소켓은 1개만 유지
 * - 합집합이 바뀌면 기존 상위 소켓을 정리하고 새 codes로 재구독
 * - 업비트에서 받은 원본 ticker JSON을 프론트 세션에 그대로 브로드캐스트
 *
 * 주의:
 * 브라우저 직결 업비트 WS는 Origin 기반 제한에 걸릴 수 있으므로,
 * 서버 중계 구조로 전환하여 해당 제한 영향을 줄인다.
 */
@Service
public class UpbitStreamService {

    private static final Logger log = LoggerFactory.getLogger(UpbitStreamService.class);

    private static final String UPBIT_STREAM_URL = "wss://api.upbit.com/websocket/v1";
    private static final int RECONNECT_DELAY_SEC = 3;

    private final UpbitPriceWebSocketHandler handler;
    private final NotificationService notificationService;
    private final ScheduledExecutorService scheduler = Executors.newSingleThreadScheduledExecutor();

    private volatile java.net.http.WebSocket upbitWs;
    private volatile boolean running = true;
    private volatile int connectionGeneration = 0;
    private volatile Set<String> currentCodes = Collections.emptySet();

    public UpbitStreamService(UpbitPriceWebSocketHandler handler, NotificationService notificationService) {
        this.handler = handler;
        this.notificationService = notificationService;
    }

    /**
     * 핸들러가 발행한 구독 코드 변경 이벤트 처리.
     */
    @EventListener
    public void handleSubscriptionChange(UpbitSubscriptionChangeEvent event) {
        applyRequestedCodes(event.getCodes());
    }

    /**
     * 요청 코드 집합을 적용하고 필요 시 상위 소켓을 재연결한다.
     */
    public synchronized void applyRequestedCodes(Set<String> requestedCodes) {
        Set<String> normalized = normalizeCodes(requestedCodes);
        if (normalized.equals(currentCodes)) {
            return;
        }

        log.info("[UpbitStream] 구독 코드 변경: {} -> {}", currentCodes, normalized);
        currentCodes = normalized;

        reconnectWithCurrentCodes("codes changed");
    }

    private synchronized void reconnectWithCurrentCodes(String reason) {
        // 세대 증가로 이전 리스너의 onClose/onError 재연결 시도를 무효화.
        final int myGeneration = ++connectionGeneration;

        closeCurrentSocket(reason);

        if (!running) return;
        if (currentCodes.isEmpty()) {
            log.info("[UpbitStream] 활성 구독 코드가 없어 상위 업비트 연결을 유지하지 않음");
            return;
        }

        connectToUpbit(myGeneration);
    }

    private void connectToUpbit(int generation) {
        if (!running) return;
        if (generation != connectionGeneration) return;

        Set<String> codesSnapshot = currentCodes;
        if (codesSnapshot.isEmpty()) return;

        try {
            String subscribePayload = buildSubscribePayload(codesSnapshot);
            log.info("[UpbitStream] 업비트 연결 시도 (generation={}, codes={})", generation, codesSnapshot);

            HttpClient.newHttpClient()
                    .newWebSocketBuilder()
                    .buildAsync(URI.create(UPBIT_STREAM_URL), new UpbitListener(generation))
                    .thenAccept(ws -> {
                        if (!running || generation != connectionGeneration) {
                            try {
                                ws.sendClose(java.net.http.WebSocket.NORMAL_CLOSURE, "stale connection");
                            } catch (Exception ignored) {
                                // 이미 종료된 연결일 수 있어 무시
                            }
                            return;
                        }

                        upbitWs = ws;
                        ws.sendText(subscribePayload, true)
                                .exceptionally(e -> {
                                    log.error("[UpbitStream] 구독 메시지 전송 실패: {}", e.getMessage());
                                    scheduleReconnect(generation);
                                    return null;
                                });

                        log.info("[UpbitStream] 업비트 연결/구독 성공 (generation={})", generation);
                    })
                    .exceptionally(e -> {
                        log.error("[UpbitStream] 연결 실패: {}", e.getMessage());
                        scheduleReconnect(generation);
                        return null;
                    });
        } catch (Exception e) {
            log.error("[UpbitStream] 연결 오류: {}", e.getMessage());
            scheduleReconnect(generation);
        }
    }

    private void scheduleReconnect(int generation) {
        if (!running) return;

        scheduler.schedule(() -> {
            if (!running) return;
            if (generation != connectionGeneration) return;
            if (currentCodes.isEmpty()) return;
            connectToUpbit(generation);
        }, RECONNECT_DELAY_SEC, TimeUnit.SECONDS);
    }

    private void closeCurrentSocket(String reason) {
        if (upbitWs == null) return;

        try {
            upbitWs.sendClose(java.net.http.WebSocket.NORMAL_CLOSURE, reason);
        } catch (Exception ignored) {
            // 이미 닫힌 경우 예외가 날 수 있어 무시
        } finally {
            upbitWs = null;
        }
    }

    private Set<String> normalizeCodes(Set<String> requestedCodes) {
        if (requestedCodes == null || requestedCodes.isEmpty()) {
            return Collections.emptySet();
        }

        return requestedCodes.stream()
                .map(String::trim)
                .filter(s -> !s.isEmpty())
                .collect(Collectors.toCollection(LinkedHashSet::new));
    }

    /**
     * 업비트 구독 메시지 생성.
     * 예:
     * [
     *   {"ticket":"upbit-ticker-server"},
     *   {"type":"ticker","codes":["KRW-BTC","KRW-USDT"]}
     * ]
     */
    private String buildSubscribePayload(Set<String> codes) {
        String joinedCodes = codes.stream()
                .map(code -> "\"" + code + "\"")
                .collect(Collectors.joining(","));

        return "[{\"ticket\":\"upbit-ticker-server\"}," +
                "{\"type\":\"ticker\",\"codes\":[" + joinedCodes + "]}]";
    }

    @PreDestroy
    public synchronized void disconnect() {
        running = false;
        scheduler.shutdownNow();
        closeCurrentSocket("shutdown");
    }

    /**
     * 업비트 상위 소켓 리스너.
     * 텍스트/바이너리 수신 모두 처리해 JSON 문자열로 핸들러에 전달한다.
     */
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
                broadcastIfNeeded(textBuffer.toString());
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
                broadcastIfNeeded(json);
            }

            ws.request(1);
            return null;
        }

        @Override
        public CompletionStage<?> onClose(java.net.http.WebSocket ws, int statusCode, String reason) {
            log.warn("[UpbitStream] 연결 종료 (generation={}, status={}): {}", generation, statusCode, reason);
            if (generation == connectionGeneration) {
                scheduleReconnect(generation);
            } else {
                log.info("[UpbitStream] 구 연결 종료 무시 (generation={}, current={})", generation, connectionGeneration);
            }
            return null;
        }

        @Override
        public void onError(java.net.http.WebSocket ws, Throwable error) {
            log.error("[UpbitStream] 스트림 오류 (generation={}): {}", generation, error.getMessage());
            if (generation == connectionGeneration) {
                notificationService.sendAlert("[UpbitStream] 오류: " + error.getMessage());
                scheduleReconnect(generation);
            } else {
                log.info("[UpbitStream] 구 연결 오류 무시 (generation={}, current={})", generation, connectionGeneration);
            }
        }

        private void broadcastIfNeeded(String json) {
            if (handler.getSessionCount() <= 0) return;
            if (json == null || json.isEmpty()) return;
            handler.broadcastPrice(json);
        }
    }
}
