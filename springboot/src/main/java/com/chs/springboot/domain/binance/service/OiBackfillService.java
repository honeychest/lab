// [AGENT] OI 히스토리 백필 서비스 — 기동 시 1회, /futures/data/openInterestHist 호출
// 연관파일: OpenInterest.java, OpenInterestRepository.java, AggTradeCollectStatusRepository.java
// 핵심흐름: @PostConstruct → 10초 딜레이 → Redis lock → FUTURES 심볼별 하루 단위 7회 호출 → batchUpdate
package com.chs.springboot.domain.binance.service;

import com.chs.springboot.domain.binance.repository.AggTradeCollectStatusRepository;
import com.chs.springboot.domain.binance.repository.OpenInterestRepository;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class OiBackfillService {

    @Value("${binance.oi-backfill.enabled:true}")
    private boolean enabled;
    private static final String LOCK_KEY    = "oi:backfill:lock";
    private static final String OI_HIST_URL = "https://fapi.binance.com/futures/data/openInterestHist";
    private static final String KLINES_URL  = "https://fapi.binance.com/fapi/v1/klines";
    private static final int    BACKFILL_DAYS = 7;
    private static final long   DAY_MS        = 86_400_000L;
    private static final long   PERIOD_MS     = 300_000L;   // 5분
    private static final int    LIMIT         = 500;

    private final OpenInterestRepository          openInterestRepository;
    private final AggTradeCollectStatusRepository statusRepository;
    private final StringRedisTemplate             redisTemplate;
    private final JdbcTemplate                    batchJdbcTemplate;
    private final ObjectMapper                    objectMapper = new ObjectMapper();

    @PostConstruct
    public void init() {
        if (!enabled) return;
        CompletableFuture.runAsync(() -> {
            try { Thread.sleep(10_000); } catch (InterruptedException ignored) {}
            runBackfill();
            fillMissingPrices();
        });
    }

    private void runBackfill() {
        boolean locked = Boolean.TRUE.equals(
            redisTemplate.opsForValue().setIfAbsent(LOCK_KEY, "locked", Duration.ofMinutes(30))
        );
        if (!locked) {
            log.info("[OiBackfill] 다른 서버가 실행 중, skip");
            return;
        }
        try {
            var symbols = statusRepository.findByEnabledTrue().stream()
                .filter(s -> "FUTURES".equals(s.getMarketType()))
                .map(s -> s.getSymbol())
                .distinct()
                .toList();

            long nowMs = System.currentTimeMillis();
            HttpClient client = HttpClient.newHttpClient();

            for (String symbol : symbols) {
                int totalSymbol = 0;
                // d=6(7일전~6일전) → d=0(오늘 하루) 순으로 하루씩 7번
                for (int d = BACKFILL_DAYS - 1; d >= 0; d--) {
                    long dayStartMs = (nowMs - (d + 1) * DAY_MS) / PERIOD_MS * PERIOD_MS;
                    long dayEndMs   = (nowMs - d * DAY_MS)       / PERIOD_MS * PERIOD_MS;
                    int inserted = backfillDay(client, symbol, dayStartMs, dayEndMs);
                    totalSymbol += inserted;
                }
                log.info("[OiBackfill] {} 완료, 총 {}건", symbol, totalSymbol);
            }
            log.info("[OiBackfill] 전체 완료");
        } catch (Exception e) {
            log.error("[OiBackfill] 실패: {}", e.getMessage(), e);
        } finally {
            redisTemplate.delete(LOCK_KEY);
        }
    }

    /** 하루 구간 [dayStartMs, dayEndMs) 를 최대 LIMIT(500)건씩 호출해 삽입. 삽입 건수 반환 */
    private int backfillDay(HttpClient client, String symbol, long dayStartMs, long dayEndMs) {
        int total = 0;
        long startMs = dayStartMs;

        while (startMs < dayEndMs) {
            String url = OI_HIST_URL
                + "?symbol=" + symbol
                + "&period=5m"
                + "&limit=" + LIMIT
                + "&startTime=" + startMs
                + "&endTime=" + dayEndMs;

            try {
                HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(url))
                    .timeout(Duration.ofSeconds(10))
                    .GET()
                    .build();

                HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());

                if (response.statusCode() != 200) {
                    log.warn("[OiBackfill] {} HTTP {} body={}, 구간 skip (startMs={})",
                        symbol, response.statusCode(), response.body(), startMs);
                    break;
                }

                JsonNode array = objectMapper.readTree(response.body());
                if (!array.isArray() || array.isEmpty()) break;

                // OI 배치의 시간 범위 파악
                long batchStartMs = Long.MAX_VALUE;
                long batchEndMs   = Long.MIN_VALUE;
                for (JsonNode node : array) {
                    long ts = node.get("timestamp").asLong();
                    if (ts < batchStartMs) batchStartMs = ts;
                    if (ts > batchEndMs)   batchEndMs   = ts;
                }

                // klines API로 동일 구간 가격 조회 (5m, 최대 500건)
                java.util.Map<Long, BigDecimal> priceMap = new java.util.HashMap<>();
                try {
                    String klinesUrl = KLINES_URL
                        + "?symbol=" + symbol
                        + "&interval=5m"
                        + "&startTime=" + batchStartMs
                        + "&endTime=" + (batchEndMs + PERIOD_MS)
                        + "&limit=" + LIMIT;
                    HttpRequest klinesReq = HttpRequest.newBuilder()
                        .uri(URI.create(klinesUrl))
                        .timeout(Duration.ofSeconds(10))
                        .GET()
                        .build();
                    HttpResponse<String> klinesResp = client.send(klinesReq, HttpResponse.BodyHandlers.ofString());
                    if (klinesResp.statusCode() == 200) {
                        JsonNode klines = objectMapper.readTree(klinesResp.body());
                        for (JsonNode k : klines) {
                            long openTime  = k.get(0).asLong();
                            BigDecimal closePrice = new BigDecimal(k.get(4).asText()); // index 4 = close
                            priceMap.put(openTime, closePrice);
                        }
                    }
                } catch (Exception ke) {
                    log.warn("[OiBackfill] {} klines 조회 실패 (startMs={}): {}", symbol, batchStartMs, ke.getMessage());
                }

                List<Object[]> batch = new ArrayList<>(array.size());
                long lastTimestamp = startMs;
                for (JsonNode node : array) {
                    long ts = node.get("timestamp").asLong();
                    batch.add(new Object[]{
                        symbol,
                        new BigDecimal(node.get("sumOpenInterest").asText()),
                        new BigDecimal(node.get("sumOpenInterestValue").asText()),
                        priceMap.getOrDefault(ts, null),
                        ts
                    });
                    if (ts > lastTimestamp) lastTimestamp = ts;
                }

                String sql = """
                    INSERT INTO open_interest (symbol, open_interest, oi_value, price, collected_at_ms)
                    VALUES (?, ?, ?, ?, ?)
                    ON DUPLICATE KEY UPDATE price = COALESCE(price, VALUES(price))
                    """;
                batchJdbcTemplate.batchUpdate(sql, batch);

                total += batch.size();
                log.info("[OiBackfill] {} {}건 삽입 (startMs={})", symbol, batch.size(), startMs);

                if (array.size() < LIMIT) break;
                startMs = lastTimestamp + PERIOD_MS;

            } catch (Exception e) {
                log.error("[OiBackfill] {} 호출 실패 (startMs={}): {}", symbol, startMs, e.getMessage());
                break;
            }
        }

        return total;
    }

    /** price IS NULL 레코드 보정 — NULL이 없으면 즉시 skip */
    private void fillMissingPrices() {
        String countSql = "SELECT COUNT(*) FROM open_interest WHERE price IS NULL";
        long nullCount = batchJdbcTemplate.queryForObject(countSql, Long.class);
        if (nullCount == 0) {
            log.info("[OiFillPrice] NULL price 없음, skip");
            return;
        }
        log.info("[OiFillPrice] NULL price {}건 보정 시작", nullCount);

        String selectSql = "SELECT id, symbol, collected_at_ms FROM open_interest WHERE price IS NULL ORDER BY symbol, collected_at_ms";
        List<Map<String, Object>> rows = batchJdbcTemplate.queryForList(selectSql);

        // 심볼별로 그룹핑
        Map<String, List<Map<String, Object>>> bySymbol = rows.stream()
            .collect(Collectors.groupingBy(r -> (String) r.get("symbol")));

        HttpClient client = HttpClient.newHttpClient();
        int totalUpdated = 0;

        for (Map.Entry<String, List<Map<String, Object>>> entry : bySymbol.entrySet()) {
            String symbol = entry.getKey();
            List<Map<String, Object>> records = entry.getValue();

            long minMs = records.stream().mapToLong(r -> ((Number) r.get("collected_at_ms")).longValue()).min().orElse(0);
            long maxMs = records.stream().mapToLong(r -> ((Number) r.get("collected_at_ms")).longValue()).max().orElse(0);

            // 1m klines로 범위 전체 조회 (최대 1000건 → 약 16시간 커버)
            Map<Long, BigDecimal> priceMap = new HashMap<>();
            long rangeStart = minMs;
            while (rangeStart <= maxMs) {
                try {
                    String url = KLINES_URL
                        + "?symbol=" + symbol
                        + "&interval=1m"
                        + "&startTime=" + rangeStart
                        + "&endTime=" + (maxMs + 60_000)
                        + "&limit=1000";
                    HttpRequest req = HttpRequest.newBuilder()
                        .uri(URI.create(url))
                        .timeout(Duration.ofSeconds(10))
                        .GET()
                        .build();
                    HttpResponse<String> resp = client.send(req, HttpResponse.BodyHandlers.ofString());
                    if (resp.statusCode() != 200) break;

                    JsonNode klines = objectMapper.readTree(resp.body());
                    if (!klines.isArray() || klines.isEmpty()) break;

                    long lastKlineTime = rangeStart;
                    for (JsonNode k : klines) {
                        long openTime = k.get(0).asLong();
                        priceMap.put(openTime, new BigDecimal(k.get(4).asText())); // close price
                        if (openTime > lastKlineTime) lastKlineTime = openTime;
                    }
                    if (klines.size() < 1000) break;
                    rangeStart = lastKlineTime + 60_000;
                } catch (Exception e) {
                    log.warn("[OiFillPrice] {} klines 조회 실패: {}", symbol, e.getMessage());
                    break;
                }
            }

            // 각 레코드 타임스탬프를 1분 floor → kline 매칭 후 UPDATE
            List<Object[]> updates = new ArrayList<>();
            for (Map<String, Object> row : records) {
                long ts = ((Number) row.get("collected_at_ms")).longValue();
                long minuteFloor = (ts / 60_000) * 60_000;
                BigDecimal price = priceMap.get(minuteFloor);
                if (price != null) {
                    updates.add(new Object[]{ price, row.get("id") });
                }
            }

            if (!updates.isEmpty()) {
                batchJdbcTemplate.batchUpdate("UPDATE open_interest SET price = ? WHERE id = ?", updates);
                totalUpdated += updates.size();
                log.info("[OiFillPrice] {} {}건 업데이트", symbol, updates.size());
            }
        }
        log.info("[OiFillPrice] 완료, 총 {}건 업데이트", totalUpdated);
    }
}
