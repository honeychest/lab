// [AGENT] 역할: Binance aggTrade WebSocket 스트림 구독 서비스 (SPOT/FUTURES) | 연관파일: AggTradeStorageService.java(→enqueue), SignalSseService.java(→broadcastAggTrade) | 핵심: @PostConstruct에서 btcusdt SPOT, enausdt SPOT/FUTURES 연결, java.net.http.WebSocket 사용, generation 기반 재연결 제어, 5초 후 자동 reconnect
package com.chs.springboot.domain.binance.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.net.URI;
import java.net.http.HttpClient;
import java.time.Duration;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

@Service
public class AggTradeStreamService {

    private static final Logger log = LoggerFactory.getLogger(AggTradeStreamService.class);

    private static final String SPOT_WS_BASE = "wss://stream.binance.com:9443/ws/"; // SPOT 웹소켓 기본 주소
    private static final String FUTURES_WS_BASE = "wss://fstream.binance.com/ws/"; // FUTURES 웹소켓 기본 주소

    private final AggTradeStorageService storageService;
    private final SignalSseService signalSseService;
    private final ObjectMapper objectMapper = new ObjectMapper();

    private final ScheduledExecutorService scheduler =
            Executors.newSingleThreadScheduledExecutor(r -> {
                Thread t = new Thread(r, "aggtrade-stream");
                t.setDaemon(false);
                return t;
            });

    private volatile boolean running = true;
    private volatile int generation = 0;

    public AggTradeStreamService(AggTradeStorageService storageService, SignalSseService signalSseService) {
        this.storageService = storageService;
        this.signalSseService = signalSseService;
    }

    @PostConstruct
    public void start() {
        connectAll();
    }

    private void connectAll() {
        connect("btcusdt", "SPOT");
        connect("btcusdt", "FUTURES");
        connect("enausdt", "SPOT");
        connect("enausdt", "FUTURES");
    }

    private void connect(String symbolLower, String marketType) {
        final int myGen = ++generation;
        scheduler.execute(() -> openStream(symbolLower, marketType, myGen));
    }

    private void openStream(String symbolLower, String marketType, int myGen) {
        if (!running) return;
        try {
            String streamName = symbolLower + "@aggTrade";
            String base = "SPOT".equals(marketType) ? SPOT_WS_BASE : FUTURES_WS_BASE;
            String url = base + streamName;
            log.info("[AggTradeStream] {} {} 연결 시도 (gen={})", symbolLower, marketType, myGen);
            HttpClient.newHttpClient()
                    .newWebSocketBuilder()
                    .connectTimeout(Duration.ofSeconds(10))
                    .buildAsync(URI.create(url), new java.net.http.WebSocket.Listener() {
                        private final String symbolUpper = symbolLower.toUpperCase();
                        // WebSocket 텍스트 프레임 조각을 모으는 버퍼
                        private final StringBuilder buffer = new StringBuilder();

                        @Override
                        public java.util.concurrent.CompletionStage<?> onText(java.net.http.WebSocket ws, CharSequence data, boolean last) {
                            buffer.append(data);
                            if (last) {
                                String json = buffer.toString();
                                buffer.setLength(0);
                                try {
                                    // ENAUSDT FUTURES aggId 추적용 로그 (INFO)
                                    if ("ENAUSDT".equals(symbolUpper) && "FUTURES".equals(marketType)) {
                                        try {
                                            var node = objectMapper.readTree(json);
                                            long aggId = node.get("a").asLong();
                                            log.debug("[AggTradeStreamDebug] RECV ENAUSDT FUTURES aggId={}", aggId);
                                        } catch (Exception ignore) {
                                            // 추적용이므로 파싱 실패는 무시
                                        }
                                    }

                                    storageService.enqueue(json, symbolUpper, marketType);
                                    
                                    // Signal Dashboard SSE 브로드캐스트
                                    try {
                                        var node = objectMapper.readTree(json);
                                        Map<String, Object> dto = new HashMap<>();
                                        dto.put("symbol", symbolUpper);
                                        dto.put("marketType", marketType);
                                        dto.put("price", node.get("p").asText());
                                        dto.put("quantity", node.get("q").asText());
                                        dto.put("isBuyerMaker", node.get("m").asBoolean());
                                        dto.put("tradedAt", node.get("T").asLong());
                                        signalSseService.broadcastAggTrade(dto);
                                    } catch (Exception ignore) {
                                        // SSE 브로드캐스트 실패는 무시 (DB 저장은 계속)
                                    }
                                    
                                    if (log.isDebugEnabled()) {
                                        log.debug("[AggTradeStream] enqueue 성공 {} {} (jsonLength={})",
                                                symbolUpper, marketType, json.length());
                                    }
                                } catch (Exception e) {
                                    log.warn("[AggTradeStream] enqueue 실패: {}", e.getMessage());
                                }
                            }
                            // 다음메시지 한 개 더 받을 준비
                            ws.request(1);
                            return null;
                        }
                        @Override
                        public java.util.concurrent.CompletionStage<?> onClose(java.net.http.WebSocket ws, int statusCode, String reason) {
                            log.warn("[AggTradeStream] 종료 {} {} (gen={}, status={}): {}", symbolUpper, marketType, myGen, statusCode, reason);
                            if (myGen == generation) {
                                scheduleReconnect(symbolLower, marketType);
                            }
                            return null;
                        }

                        @Override
                        public void onError(java.net.http.WebSocket ws, Throwable error) {
                            log.error("[AggTradeStream] 오류 {} {} (gen={}): {}", symbolUpper, marketType, myGen, error.getMessage());
                            if (myGen == generation) {
                                scheduleReconnect(symbolLower, marketType);
                            }
                        }
                    });
        } catch (Exception e) {
            log.error("[AggTradeStream] 연결 오류 {} {}: {}", symbolLower, marketType, e.getMessage());
            scheduleReconnect(symbolLower, marketType);
        }
    }

    private void scheduleReconnect(String symbolLower, String marketType) {
        if (!running) return;
        scheduler.schedule(() -> connect(symbolLower, marketType), 5, TimeUnit.SECONDS);
    }

    @PreDestroy
    public void stop() {
        running = false;
        scheduler.shutdownNow();
    }
}

