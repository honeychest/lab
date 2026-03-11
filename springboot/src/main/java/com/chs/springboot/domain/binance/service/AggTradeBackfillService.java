package com.chs.springboot.domain.binance.service;

import com.chs.springboot.domain.binance.model.RawAggTrade;
import com.chs.springboot.global.redis.LeaderElectionService;
import com.chs.springboot.global.telegram.TelegramLog;
import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.scheduling.concurrent.CustomizableThreadFactory;
import org.springframework.stereotype.Service;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.concurrent.*;

@Service
public class AggTradeBackfillService {

    private static final Logger log = LoggerFactory.getLogger(AggTradeBackfillService.class);

    private static final String BACKFILL_LOCK_KEY = "aggtrade:backfill:lock";

    private final StringRedisTemplate redisTemplate;
    private final AggTradeConfigService configService;
    private final LeaderElectionService leaderElectionService;

    private final ScheduledExecutorService scheduler =
            Executors.newSingleThreadScheduledExecutor(new CustomizableThreadFactory("aggtrade-backfill-"));
    private final ScheduledExecutorService heartbeatScheduler =
            Executors.newSingleThreadScheduledExecutor(new CustomizableThreadFactory("aggtrade-backfill-heartbeat-"));

    private ScheduledFuture<?> scheduledFuture;

    // application.properties 에서 설정된 값을 주입 없으면 :값이 기본값으로 설정된다.
    @Value("${binance.rest.spot.base-url:https://api.binance.com}")
    private String binanceSpotBaseUrl;

    @Value("${binance.rest.futures.base-url:https://fapi.binance.com}")
    private String binanceFuturesBaseUrl;

    @Value("${binance.agg-trade.save.enabled:true}")
    private boolean aggTradeSaveEnabled;

    public AggTradeBackfillService(StringRedisTemplate redisTemplate,
                                   AggTradeConfigService configService,
                                   LeaderElectionService leaderElectionService) {
        this.redisTemplate = redisTemplate;
        this.configService = configService;
        this.leaderElectionService = leaderElectionService;
    }

    @PostConstruct
    public void init() {
        scheduleBackfillSeconds(0);
    }

    public synchronized void rescheduleMinutes(int minutes) {
        scheduleBackfillSeconds(minutes * 60L);
    }

    private synchronized void scheduleBackfillSeconds(long delaySec) {
        if (scheduledFuture != null) {
            scheduledFuture.cancel(false);
        }
        scheduledFuture = scheduler.schedule(this::runBackfillSafely, delaySec, TimeUnit.SECONDS);
        log.info("[AggTradeBackfill] {}초 후 Backfill 예약", delaySec);
    }

    private void runBackfillSafely() {
        try {
            if (!aggTradeSaveEnabled) {
                log.info("[AggTradeBackfill] 기능 비활성화 상태, 종료");
                return;
            }
            runBackfill();
        } catch (Exception e) {
            log.error("[AggTradeBackfill] 실행 실패: {}", e.getMessage());
        }
    }

    private void runBackfill() {
        try {
            boolean locked = Boolean.TRUE.equals(
                    redisTemplate.opsForValue().setIfAbsent(BACKFILL_LOCK_KEY, leaderElectionService.getServerName(), Duration.ofMinutes(2))
            );
            if (!locked) {
                log.info("[AggTradeBackfill] 다른 서버가 실행 중, 30분 후 재예약");
                scheduleBackfillSeconds(30 * 60L);
                return;
            }

            CountDownLatch latch = new CountDownLatch(1);
            heartbeatScheduler.scheduleAtFixedRate(() -> {
                try {
                    redisTemplate.expire(BACKFILL_LOCK_KEY, Duration.ofMinutes(2));
                } catch (Exception e) {
                    log.warn("[AggTradeBackfill] heartbeat 실패: {}", e.getMessage());
                }
            }, 30, 30, TimeUnit.SECONDS);

            try {
                executeBackfill();
            } finally {
                latch.countDown();
                redisTemplate.delete(BACKFILL_LOCK_KEY);
            }

            scheduleBackfillSeconds(60L);
        } catch (Exception e) {
            log.error("[AggTradeBackfill] 예외 발생: {}", e.getMessage());
            scheduleBackfillSeconds(60L);
        }
    }

    private void executeBackfill() throws Exception {
        List<Map.Entry<String, String>> targets = Arrays.asList(
                // Map.entry("BTCUSDT", "SPOT"),
                // Map.entry("BTCUSDT", "FUTURES"),
                Map.entry("ENAUSDT", "SPOT"),
                Map.entry("ENAUSDT", "FUTURES")
        );

        for (Map.Entry<String, String> target : targets) {
            String symbol = target.getKey();
            String marketType = target.getValue();
            try {
                backfillOne(symbol, marketType);
            } catch (Exception e) {
                TelegramLog.error("[AggTradeBackfill] " + symbol + " / " + marketType + " 실패: " + e.getMessage());
            }
        }
    }

    private void backfillOne(String symbol, String marketType) throws Exception {
        String checkpointKey = "aggtrade:checkpoint:" + symbol + ":" + marketType;
        String checkpoint = redisTemplate.opsForValue().get(checkpointKey);
        long lastId;
        if (checkpoint != null) {
            lastId = Long.parseLong(checkpoint);
        } else {
            // DB MAX(agg_trade_id) 조회는 생략하고, 없으면 스킵 (실제 구현 시 Repository 주입 후 사용)
            log.info("[AggTradeBackfill] {} / {} checkpoint·DB 없음, 스킵", symbol, marketType);
            return;
        }

        HttpClient client = HttpClient.newHttpClient();
        int weightLimit = configService.getWeightPerMinute();
        long currentFromId = lastId;

        while (true) {
            String path;
            String base;
            if ("SPOT".equals(marketType)) {
                base = binanceSpotBaseUrl;
                path = "/api/v3/aggTrades";
            } else { // FUTURES
                base = binanceFuturesBaseUrl;
                path = "/fapi/v1/aggTrades";
            }
            String url = base + path + "?symbol=" + symbol + "&fromId=" + currentFromId + "&limit=1000";
            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(url))
                    .timeout(Duration.ofSeconds(10))
                    .GET()
                    .build();

            HttpResponse<String> response;
            try {
                response = client.send(request, HttpResponse.BodyHandlers.ofString());
            } catch (Exception e) {
                log.error("[AggTradeBackfill] REST 실패: {}", e.getMessage());
                throw e;
            }

            String usedWeightHeader = response.headers().firstValue("X-MBX-USED-WEIGHT-1M").orElse("0");
            int usedWeight = Integer.parseInt(usedWeightHeader);
            log.info("[AggTradeBackfill] {} {} fromId={} status={} usedWeight={}/{}",
                    symbol, marketType, currentFromId, response.statusCode(), usedWeight, weightLimit);
            if (usedWeight >= weightLimit * 0.9) {
                TelegramLog.info("[AggTradeBackfill] weight 90% 초과, 60초 대기");
                Thread.sleep(60_000L);
            }

            if (response.statusCode() != 200) {
                throw new IllegalStateException("HTTP " + response.statusCode());
            }

            String body = response.body();
            com.fasterxml.jackson.databind.ObjectMapper mapper = new com.fasterxml.jackson.databind.ObjectMapper();
            com.fasterxml.jackson.databind.JsonNode array = mapper.readTree(body);
            if (!array.isArray() || array.isEmpty()) {
                log.info("[AggTradeBackfill] {} {} fromId={} 응답 0건, 종료", symbol, marketType, currentFromId);
                break;
            }
            log.info("[AggTradeBackfill] {} {} fromId={} 응답 {}건", symbol, marketType, currentFromId, array.size());

            List<RawAggTrade> entities = new java.util.ArrayList<>();
            long maxId = currentFromId;
            long minId = Long.MAX_VALUE;
            for (com.fasterxml.jackson.databind.JsonNode node : array) {
                RawAggTrade t = new RawAggTrade();
                t.setSymbol(symbol);
                t.setMarketType(marketType);
                long aggId = node.get("a").asLong();
                t.setAggTradeId(aggId);
                t.setPrice(new java.math.BigDecimal(node.get("p").asText()));
                t.setQuantity(new java.math.BigDecimal(node.get("q").asText()));
                t.setFirstTradeId(node.get("f").asLong());
                t.setLastTradeId(node.get("l").asLong());
                t.setIsBuyerMaker(node.get("m").asBoolean());
                t.setTradedAt(node.get("T").asLong());
                entities.add(t);
                if (aggId > maxId) {
                    maxId = aggId;
                }
                if (aggId < minId) {
                    minId = aggId;
                }
            }

            if ("ENAUSDT".equals(symbol) && "FUTURES".equals(marketType) && log.isDebugEnabled()) {
                log.debug("[AggTradeBackfillDebug] ENAUSDT FUTURES fromId={} batchSize={} aggIdRange={}~{}",
                        currentFromId, array.size(), minId, maxId);
            }

            // 실제 구현에서는 RawAggTradeRepository.batchInsertIgnoreDuplicate 사용 필요
            // 여기서는 저장 호출을 생략하고 checkpoint만 갱신
            redisTemplate.opsForValue().set(checkpointKey, String.valueOf(maxId));

            if (array.size() < 1000) {
                break;
            }
            currentFromId = maxId + 1;
        }
    }

    @PreDestroy
    public void destroy() {
        scheduler.shutdown();
        heartbeatScheduler.shutdown();
    }
}

