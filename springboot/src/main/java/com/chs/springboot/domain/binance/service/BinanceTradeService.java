// [AGENT] 역할: BTC 대형 체결 수집 서비스 — 현물(@trade)·선물(@aggTrade) WS 구독, 300k USD 이상 체결을 Redis SETNX 중복 차단 후 DB 저장 → SSE broadcast
// 연관파일: BinanceTrade.java, BinanceTradeRepository.java, BinanceTradeSseService.java, RawTickStorageService.java, TelegramLog.java
// 주요메서드: init()(@PostConstruct), connectSpot(), connectFutures(), parseAndSave(), scheduleReconnect(), destroy()(@PreDestroy)
package com.chs.springboot.domain.binance.service;

import com.chs.springboot.domain.binance.model.BinanceTrade;
import com.chs.springboot.domain.binance.model.BinanceTradeDto;
import com.chs.springboot.domain.binance.model.RawTickDto;
import com.chs.springboot.domain.binance.repository.BinanceTradeRepository;
import com.chs.springboot.global.telegram.TelegramLog;
import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.net.URI;
import java.net.http.HttpClient;
import java.time.Duration;
import java.util.concurrent.CompletionStage;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

@Service
public class BinanceTradeService {

    private static final Logger log = LoggerFactory.getLogger(BinanceTradeService.class);

    private static final String SPOT_URL    = "wss://stream.binance.com:9443/ws/btcusdt@trade";
    private static final String FUTURES_URL = "wss://fstream.binance.com/ws/btcusdt@trade";
    private static final String MARKET_SPOT       = "SPOT";
    private static final String MARKET_FUTURES    = "FUTURES";
    private static final String THRESHOLD_KEY     = "threshold";
    private static final BigDecimal DEFAULT_THRESHOLD = new BigDecimal("100000");
    private static final int RECONNECT_DELAY_SEC  = 5;

    private final AtomicReference<BigDecimal> threshold = new AtomicReference<>(DEFAULT_THRESHOLD);

    private final BinanceTradeRepository binanceTradeRepository;
    private final StringRedisTemplate redisTemplate;
    private final BinanceTradeSseService sseService;
    private final RawTickSseService rawTickSseService;
    private final RawTickStorageService rawTickStorageService;
    private final ObjectMapper objectMapper = new ObjectMapper();

    @Value("${binance.tick-trade.save.enabled:true}")
    private boolean tickTradeSaveEnabled;

    private final ScheduledExecutorService scheduler = Executors.newSingleThreadScheduledExecutor();

    private volatile boolean running = true;

    private volatile java.net.http.WebSocket spotWs;
    private volatile java.net.http.WebSocket futuresWs;

    private volatile int spotGeneration    = 0;
    private volatile int futuresGeneration = 0;

    private volatile int spotFailCount    = 0;
    private volatile int futuresFailCount = 0;

    public BinanceTradeService(BinanceTradeRepository binanceTradeRepository,
                               StringRedisTemplate redisTemplate,
                               BinanceTradeSseService sseService,
                               RawTickSseService rawTickSseService,
                               RawTickStorageService rawTickStorageService) {
        this.binanceTradeRepository = binanceTradeRepository;
        this.redisTemplate = redisTemplate;
        this.sseService = sseService;
        this.rawTickSseService = rawTickSseService;
        this.rawTickStorageService = rawTickStorageService;
    }

    @PostConstruct
    public void init() {
        String val = redisTemplate.opsForValue().get("config:" + THRESHOLD_KEY);
        if (val != null) threshold.set(new BigDecimal(val));
        log.info("[BinanceTrade] threshold 초기값: {}", threshold.get());
        connectSpot();
        connectFutures();
    }

    // ── 연결 ─────────────────────────────────────────────────────────────

    private void connectSpot() {
        if (!running) return;
        final int myGen = ++spotGeneration;
        try {
            log.info("[BinanceTrade] SPOT 연결 시도 (generation={})", myGen);
            HttpClient.newHttpClient()
                    .newWebSocketBuilder()
                    .buildAsync(URI.create(SPOT_URL), new BinanceTradeListener(myGen, MARKET_SPOT))
                    .thenAccept(ws -> {
                        this.spotWs = ws;
                        spotFailCount = 0;
                        log.info("[BinanceTrade] SPOT 연결 성공");
                    })
                    .exceptionally(e -> {
                        log.error("[BinanceTrade] SPOT 연결 실패: {}", e.getMessage());
                        onFailure(MARKET_SPOT);
                        scheduleReconnect(MARKET_SPOT);
                        return null;
                    });
        } catch (Exception e) {
            log.error("[BinanceTrade] SPOT 연결 오류: {}", e.getMessage());
            onFailure(MARKET_SPOT);
            scheduleReconnect(MARKET_SPOT);
        }
    }

    private void connectFutures() {
        if (!running) return;
        final int myGen = ++futuresGeneration;
        try {
            log.info("[BinanceTrade] FUTURES 연결 시도 (generation={})", myGen);
            HttpClient.newHttpClient()
                    .newWebSocketBuilder()
                    .buildAsync(URI.create(FUTURES_URL), new BinanceTradeListener(myGen, MARKET_FUTURES))
                    .thenAccept(ws -> {
                        this.futuresWs = ws;
                        futuresFailCount = 0;
                        log.info("[BinanceTrade] FUTURES 연결 성공");
                    })
                    .exceptionally(e -> {
                        log.error("[BinanceTrade] FUTURES 연결 실패: {}", e.getMessage());
                        onFailure(MARKET_FUTURES);
                        scheduleReconnect(MARKET_FUTURES);
                        return null;
                    });
        } catch (Exception e) {
            log.error("[BinanceTrade] FUTURES 연결 오류: {}", e.getMessage());
            onFailure(MARKET_FUTURES);
            scheduleReconnect(MARKET_FUTURES);
        }
    }

    // ── 재연결 & 알림 ─────────────────────────────────────────────────────

    private void scheduleReconnect(String marketType) {
        if (!running) return;
        log.info("[BinanceTrade] {} {}초 후 재연결 예약", marketType, RECONNECT_DELAY_SEC);
        if (MARKET_SPOT.equals(marketType)) {
            scheduler.schedule(this::connectSpot, RECONNECT_DELAY_SEC, TimeUnit.SECONDS);
        } else {
            scheduler.schedule(this::connectFutures, RECONNECT_DELAY_SEC, TimeUnit.SECONDS);
        }
    }

    private void onFailure(String marketType) {
        int count;
        if (MARKET_SPOT.equals(marketType)) {
            count = ++spotFailCount;
        } else {
            count = ++futuresFailCount;
        }

        if (count == 5 || (count > 5 && count % 10 == 0)) {
            try {
                Boolean canAlert = redisTemplate.opsForValue()
                        .setIfAbsent("bigtick:alert:" + marketType, "1", Duration.ofSeconds(60));
                if (Boolean.TRUE.equals(canAlert)) {
                    TelegramLog.error("[BinanceTrade] " + marketType + " 연결 실패 " + count + "회");
                }
            } catch (Exception e) {
                log.error("[BinanceTrade] 알림 Redis 오류: {}", e.getMessage());
            }
        }
    }

    // ── 메시지 처리 ───────────────────────────────────────────────────────

    private void parseAndSave(String json, String marketType) {
        try {
            JsonNode node = objectMapper.readTree(json);

            long tradeId         = node.get("t").asLong();
            BigDecimal price     = new BigDecimal(node.get("p").asText());
            BigDecimal quantity  = new BigDecimal(node.get("q").asText());
            boolean isBuyerMaker = node.get("m").asBoolean();
            long tradedAt        = node.get("T").asLong();

            BigDecimal tradeValue = price.multiply(quantity);
            BigDecimal effectiveThreshold = MARKET_SPOT.equals(marketType)
                    ? threshold.get().divide(new BigDecimal("2"), 0, java.math.RoundingMode.HALF_UP)
                    : threshold.get();
            if (tradeValue.compareTo(effectiveThreshold) < 0) {
                return;
            }

            // Redis SETNX — 중복 체결 차단
            Boolean isNew;
            try {
                isNew = redisTemplate.opsForValue()
                        .setIfAbsent("bigtick:" + marketType + ":" + tradeId, "1", Duration.ofSeconds(300));
            } catch (Exception e) {
                log.error("[BinanceTrade] Redis 오류, DB 저장 진행: {}", e.getMessage());
                isNew = true; // Redis 장애 시 DB unique 제약이 최후 안전망
            }

            if (!Boolean.TRUE.equals(isNew)) {
                log.debug("[BinanceTrade] {} tradeId={} 이미 처리됨 (Redis 선점)", marketType, tradeId);
                return;
            }

            BinanceTrade tick = new BinanceTrade();
            tick.setTradeId(tradeId);
            tick.setSymbol("BTCUSDT");
            tick.setMarketType(marketType);
            tick.setPrice(price);
            tick.setQuantity(quantity);
            tick.setTradeValue(tradeValue);
            tick.setIsBuyerMaker(isBuyerMaker);
            tick.setTradedAt(tradedAt);

            try {
                binanceTradeRepository.save(tick);
                sseService.broadcast(BinanceTradeDto.from(tick)); // DB 저장 성공 시에만 broadcast
            } catch (DataIntegrityViolationException e) {
                log.debug("[BinanceTrade] {} tradeId={} DB unique 위반 (최후 안전망)", marketType, tradeId);
            } catch (Exception e) {
                log.error("[BinanceTrade] {} tradeId={} DB 저장 오류: {}", marketType, tradeId, e.getMessage());
            }

        } catch (Exception e) {
            log.warn("[BinanceTrade] {} 메시지 파싱 실패: {}", marketType, e.getMessage());
        }
    }

    // ── threshold 조회/변경 ───────────────────────────────────────────────

    /** 조회 시 Redis 우선 사용 — 다중 인스턴스에서 동일 값 보장 */
    public BigDecimal getThreshold() {
        try {
            String val = redisTemplate.opsForValue().get("config:" + THRESHOLD_KEY);
            if (val != null) {
                BigDecimal fromRedis = new BigDecimal(val);
                threshold.set(fromRedis);
                return fromRedis;
            }
        } catch (Exception e) {
            log.warn("[BinanceTrade] threshold Redis 조회 실패, 메모리 값 사용: {}", e.getMessage());
        }
        return threshold.get();
    }

    public void updateThreshold(BigDecimal value) {
        threshold.set(value);
        redisTemplate.opsForValue().set("config:" + THRESHOLD_KEY, value.toPlainString());
        log.info("[BinanceTrade] threshold 변경: {}", value);
    }

    // ── 종료 ─────────────────────────────────────────────────────────────

    @PreDestroy
    public void destroy() {
        running = false;
        scheduler.shutdownNow();
        if (spotWs != null) {
            try { spotWs.sendClose(java.net.http.WebSocket.NORMAL_CLOSURE, "shutdown"); } catch (Exception ignored) {}
        }
        if (futuresWs != null) {
            try { futuresWs.sendClose(java.net.http.WebSocket.NORMAL_CLOSURE, "shutdown"); } catch (Exception ignored) {}
        }
    }

    // ── 리스너 ────────────────────────────────────────────────────────────

    private class BinanceTradeListener implements java.net.http.WebSocket.Listener {

        private final int generation;
        private final String marketType;
        private final StringBuilder buffer = new StringBuilder();

        BinanceTradeListener(int generation, String marketType) {
            this.generation = generation;
            this.marketType = marketType;
        }

        @Override
        public CompletionStage<?> onText(java.net.http.WebSocket ws, CharSequence data, boolean last) {
            buffer.append(data);
            if (last) {
                String json = buffer.toString();
                try {
                    JsonNode node = objectMapper.readTree(json);
                    String price = node.get("p").asText();
                    String quantity = node.get("q").asText();
                    boolean isBuyerMaker = node.get("m").asBoolean();
                    BigDecimal p = new BigDecimal(price);
                    BigDecimal q = new BigDecimal(quantity);
                    if (p.compareTo(BigDecimal.ZERO) <= 0 || q.compareTo(BigDecimal.ZERO) <= 0) {
                        String snippet = json.length() > 200 ? json.substring(0, 200) + "..." : json;
                        log.info("[BinanceTrade] 틱 0/비정상 제외 p={}, q={}, marketType={}, snippet={}",
                                price, quantity, marketType, snippet);
                    } else {
                        if (tickTradeSaveEnabled) {
                            try {
                                rawTickStorageService.enqueue(json, marketType);
                            } catch (Exception e) {
                                log.warn("[BinanceTrade] RawTick enqueue 실패: {}", e.getMessage());
                            }
                            parseAndSave(json, marketType);
                        }
                        rawTickSseService.broadcast(new RawTickDto(price, quantity, isBuyerMaker, marketType));
                    }
                } catch (Exception e) {
                    log.warn("[BinanceTrade] 틱 파싱 실패(전체 스킵): {}", e.getMessage());
                }
                buffer.setLength(0);
            }
            ws.request(1);
            return null;
        }

        @Override
        public CompletionStage<?> onClose(java.net.http.WebSocket ws, int statusCode, String reason) {
            log.warn("[BinanceTrade] {} 연결 종료 (generation={}, status={}): {}", marketType, generation, statusCode, reason);
            if (isCurrentGeneration()) {
                onFailure(marketType);
                scheduleReconnect(marketType);
            } else {
                log.info("[BinanceTrade] {} 구 연결 종료 무시 (generation={})", marketType, generation);
            }
            return null;
        }

        @Override
        public void onError(java.net.http.WebSocket ws, Throwable error) {
            log.error("[BinanceTrade] {} 스트림 오류 (generation={}): {}", marketType, generation, error.getMessage());
            if (isCurrentGeneration()) {
                onFailure(marketType);
                scheduleReconnect(marketType);
            } else {
                log.info("[BinanceTrade] {} 구 연결 오류 무시 (generation={})", marketType, generation);
            }
        }

        private boolean isCurrentGeneration() {
            return MARKET_SPOT.equals(marketType)
                    ? generation == spotGeneration
                    : generation == futuresGeneration;
        }
    }
}
