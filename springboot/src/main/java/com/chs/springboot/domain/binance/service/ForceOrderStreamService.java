// [AGENT] Binance Force Order WebSocket 스트림 구독 서비스 — market?streams 방식, BTCUSDT/ENAUSDT 필터링
// 연관파일: ForceOrderRepository.java, SignalSseService.java, LeaderElectionService.java
// 핵심: @PostConstruct에서 리더 체크 후 연결, generation 기반 재연결 제어, 5초 후 자동 reconnect
package com.chs.springboot.domain.binance.service;

import com.chs.springboot.domain.binance.model.ForceOrder;
import com.chs.springboot.domain.binance.repository.ForceOrderRepository;
import com.chs.springboot.global.redis.LeaderElectionService;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.net.URI;
import java.net.http.HttpClient;
import java.time.Duration;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;

@Slf4j
@Service
@RequiredArgsConstructor
public class ForceOrderStreamService {

    private static final String FORCE_ORDER_WS_URL = "wss://fstream.binance.com/market/stream?streams=btcusdt@forceOrder/enausdt@forceOrder";
    private static final List<String> TARGET_SYMBOLS = List.of("BTCUSDT", "ENAUSDT");

    private final LeaderElectionService leaderElectionService;
    private final ForceOrderRepository forceOrderRepository;
    private final SignalSseService signalSseService;
    private final ObjectMapper objectMapper = new ObjectMapper();

    private final ScheduledExecutorService scheduler =
            Executors.newSingleThreadScheduledExecutor(r -> {
                Thread t = new Thread(r, "force-order-stream");
                t.setDaemon(false);
                return t;
            });
    private final HttpClient httpClient = HttpClient.newHttpClient();

    private volatile boolean running = true;
    private final AtomicInteger generation = new AtomicInteger(0);
    private final AtomicBoolean reconnectPending = new AtomicBoolean(false);

    @PostConstruct
    public void start() {
        connect();
    }

    private void connect() {
        final int myGen = generation.incrementAndGet();
        reconnectPending.set(false);
        scheduler.execute(() -> openStream(myGen));
    }

    private void openStream(int myGen) {
        if (!running) return;
        try {
            log.info("[ForceOrderStream] 연결 시도 (gen={})", myGen);
            httpClient.newWebSocketBuilder()
                    .connectTimeout(Duration.ofSeconds(10))
                    .buildAsync(URI.create(FORCE_ORDER_WS_URL), new java.net.http.WebSocket.Listener() {
                        private final StringBuilder buffer = new StringBuilder();

                        @Override
                        public void onOpen(java.net.http.WebSocket ws) {
                            log.info("[ForceOrderStream] WebSocket 연결 성공 (gen={})", myGen);
                            ws.request(1);
                        }

                        @Override
                        public java.util.concurrent.CompletionStage<?> onText(java.net.http.WebSocket ws, CharSequence data, boolean last) {
                            buffer.append(data);
                            if (last) {
                                String json = buffer.toString();
                                buffer.setLength(0);
                                try {
                                    JsonNode root = objectMapper.readTree(json);
                                    JsonNode payload = root.has("data") ? root.get("data") : root;
                                    JsonNode o = payload.get("o");
                                    if (o == null) {
                                        log.warn("[ForceOrderStream] o==null 스킵 raw={}", json);
                                        ws.request(1);
                                        return null;
                                    }

                                    String symbol = o.get("s").asText();
                                    if (!TARGET_SYMBOLS.contains(symbol)) {
                                        ws.request(1);
                                        return null;
                                    }

                                    if (!leaderElectionService.isLeader()) {
                                        ws.request(1);
                                        return null;
                                    }

                                    ForceOrder forceOrder = new ForceOrder();
                                    forceOrder.setSymbol(symbol);
                                    forceOrder.setSide(o.get("S").asText());
                                    forceOrder.setOrderType(o.get("o").asText());
                                    forceOrder.setTimeInForce(o.get("f").asText());
                                    forceOrder.setOriginalQuantity(new BigDecimal(o.get("q").asText()));
                                    forceOrder.setPrice(new BigDecimal(o.get("p").asText()));
                                    forceOrder.setAvgPrice(new BigDecimal(o.get("ap").asText()));
                                    forceOrder.setOrderStatus(o.get("X").asText());
                                    forceOrder.setLastFilledQty(new BigDecimal(o.get("l").asText()));
                                    forceOrder.setFilledAccumulatedQty(new BigDecimal(o.get("z").asText()));
                                    forceOrder.setTradeTimeMs(o.get("T").asLong());
                                    forceOrder.setEventTimeMs(payload.get("E").asLong());

                                    forceOrderRepository.insertIgnoreDuplicate(forceOrder);
                                    
                                    log.info("[ForceOrderStream] 청산 데이터 수집 → {} {} {} @ {} (tradeTimeMs: {})",
                                        symbol,
                                        forceOrder.getSide(),
                                        forceOrder.getOriginalQuantity(),
                                        forceOrder.getPrice(),
                                        forceOrder.getTradeTimeMs());

                                    Map<String, Object> dto = new HashMap<>();
                                    dto.put("symbol",       symbol);
                                    dto.put("side",         forceOrder.getSide());
                                    dto.put("price",        forceOrder.getPrice().toPlainString());
                                    dto.put("avgPrice",     forceOrder.getAvgPrice().toPlainString());
                                    dto.put("quantity",     forceOrder.getOriginalQuantity().toPlainString());
                                    dto.put("tradeTimeMs",  forceOrder.getTradeTimeMs());
                                    signalSseService.broadcastForceOrder(dto);

                                    log.info("[ForceOrderStream] SSE 브로드캐스트 완료 → {}", symbol);
                                } catch (Exception e) {
                                    log.warn("[ForceOrderStream] 처리 실패: {}", e.getMessage());
                                }
                            }
                            ws.request(1);
                            return null;
                        }

                        @Override
                        public java.util.concurrent.CompletionStage<?> onClose(java.net.http.WebSocket ws, int statusCode, String reason) {
                            log.warn("[ForceOrderStream] 종료 (gen={}, status={}): {}", myGen, statusCode, reason);
                            if (myGen == generation.get()) {
                                scheduleReconnect();
                            }
                            return null;
                        }

                        @Override
                        public void onError(java.net.http.WebSocket ws, Throwable error) {
                            log.error("[ForceOrderStream] 오류 (gen={}): {}", myGen, error.getMessage());
                            if (myGen == generation.get()) {
                                scheduleReconnect();
                            }
                        }
                    })
                    .exceptionally(ex -> {
                        log.error("[ForceOrderStream] 연결 실패 (gen={}): {}", myGen, ex.getMessage());
                        if (myGen == generation.get()) scheduleReconnect();
                        return null;
                    });
        } catch (Exception e) {
            log.error("[ForceOrderStream] 연결 오류: {}", e.getMessage());
            scheduleReconnect();
        }
    }

    private void scheduleReconnect() {
        if (!running) return;
        if (!reconnectPending.compareAndSet(false, true)) return;
        scheduler.schedule(this::connect, 5, TimeUnit.SECONDS);
    }

    @PreDestroy
    public void stop() {
        running = false;
        scheduler.shutdownNow();
    }
}
