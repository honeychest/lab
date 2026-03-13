// [AGENT] 역할: 수동 수집 서비스 — 비동기 Job 관리, 타입별 Binance REST 호출 | 연관파일: ManualBackfillController.java
// 지원 타입: RAW_AGG_TRADE(fromId~toId), AGG_1M/5M(fromMs~toMs rollup), OI(REST 호출)
// Job 상태: RUNNING → DONE | ERROR / ConcurrentHashMap 저장 (앱 재시작 시 초기화)
package com.chs.springboot.domain.binance.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.*;
import java.util.concurrent.*;

@Service
public class ManualBackfillService {

    private static final Logger log = LoggerFactory.getLogger(ManualBackfillService.class);
    private static final ObjectMapper mapper = new ObjectMapper();

    private final JdbcTemplate jdbc;
    private final ExecutorService executor = Executors.newCachedThreadPool(r -> {
        Thread t = new Thread(r, "manual-backfill");
        t.setDaemon(true);
        return t;
    });
    private final ConcurrentHashMap<String, JobStatus> jobs = new ConcurrentHashMap<>();

    @Value("${binance.rest.spot.base-url:https://api.binance.com}")
    private String spotBaseUrl;

    @Value("${binance.rest.futures.base-url:https://fapi.binance.com}")
    private String futuresBaseUrl;

    public ManualBackfillService(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    // ─── Job Record ──────────────────────────────────────────────────────────

    public record JobStatus(
        String jobId,
        String type,
        String symbol,
        String marketType,
        String status,      // RUNNING | DONE | ERROR
        String message,
        long   startedAt,
        Long   finishedAt,
        int    inserted
    ) {}

    // ─── Job Start ───────────────────────────────────────────────────────────

    public String startCollect(String type, String symbol, String marketType,
                               Long fromId, Long toId, Long fromMs, Long toMs) {
        String jobId = UUID.randomUUID().toString().substring(0, 8);
        long now = System.currentTimeMillis();
        jobs.put(jobId, new JobStatus(jobId, type, symbol, marketType, "RUNNING", null, now, null, 0));

        CompletableFuture.runAsync(() -> {
            try {
                int inserted = switch (type.toUpperCase()) {
                    case "RAW_AGG_TRADE" -> collectRawAggTrade(symbol, marketType, fromId, toId);
                    case "AGG_1M"        -> collectRollup1m(symbol, marketType, fromMs, toMs);
                    case "AGG_5M"        -> collectRollup5m(symbol, marketType, fromMs, toMs);
                    case "OI"            -> collectOi(symbol, fromMs, toMs);
                    default -> throw new IllegalArgumentException("Unknown type: " + type);
                };
                JobStatus prev = jobs.get(jobId);
                jobs.put(jobId, new JobStatus(jobId, type, symbol, marketType, "DONE", null,
                        prev.startedAt(), System.currentTimeMillis(), inserted));
                log.info("[ManualBackfill] {} {} {} 완료, {}건", type, symbol, marketType, inserted);
            } catch (Exception e) {
                log.error("[ManualBackfill] {} {} {} 실패: {}", type, symbol, marketType, e.getMessage(), e);
                JobStatus prev = jobs.get(jobId);
                jobs.put(jobId, new JobStatus(jobId, type, symbol, marketType, "ERROR", e.getMessage(),
                        prev.startedAt(), System.currentTimeMillis(), 0));
            }
        }, executor);

        return jobId;
    }

    public JobStatus getStatus(String jobId) {
        return jobs.get(jobId);
    }

    public List<JobStatus> getAllJobs() {
        return jobs.values().stream()
            .sorted(Comparator.comparingLong(JobStatus::startedAt).reversed())
            .toList();
    }

    // ─── RAW_AGG_TRADE ───────────────────────────────────────────────────────

    private int collectRawAggTrade(String symbol, String marketType, Long fromId, Long toId) throws Exception {
        HttpClient client = HttpClient.newHttpClient();
        String base = "SPOT".equals(marketType) ? spotBaseUrl : futuresBaseUrl;
        String path = "SPOT".equals(marketType) ? "/api/v3/aggTrades" : "/fapi/v1/aggTrades";

        long currentFromId = fromId != null ? fromId : 0L;
        int total = 0;

        while (true) {
            String url = base + path + "?symbol=" + symbol + "&fromId=" + currentFromId + "&limit=1000";
            HttpResponse<String> response = httpGet(client, url);

            String usedWeightStr = response.headers().firstValue("X-MBX-USED-WEIGHT-1M").orElse("0");
            int usedWeight = Integer.parseInt(usedWeightStr);
            log.info("[ManualBackfill] RAW {} {} fromId={} status={} weight={}", symbol, marketType, currentFromId, response.statusCode(), usedWeight);

            if (usedWeight >= 1800) { // 90% of 2000
                log.warn("[ManualBackfill] weight 90% 초과, 60초 대기");
                Thread.sleep(60_000);
                continue;
            }

            if (response.statusCode() != 200) {
                throw new IllegalStateException("HTTP " + response.statusCode() + ": " + response.body());
            }

            JsonNode array = mapper.readTree(response.body());
            if (!array.isArray() || array.isEmpty()) break;

            List<Object[]> batch = new ArrayList<>();
            long batchMaxId = currentFromId;

            for (JsonNode node : array) {
                long aggId = node.get("a").asLong();
                if (toId != null && aggId > toId) break;
                batch.add(new Object[]{
                    symbol, marketType, aggId,
                    new BigDecimal(node.get("p").asText()),
                    new BigDecimal(node.get("q").asText()),
                    node.get("f").asLong(),
                    node.get("l").asLong(),
                    node.get("m").asBoolean(),
                    node.get("T").asLong()
                });
                if (aggId > batchMaxId) batchMaxId = aggId;
            }

            if (!batch.isEmpty()) {
                String sql = """
                    INSERT INTO raw_agg_trade
                    (symbol, market_type, agg_trade_id, price, quantity, first_trade_id, last_trade_id, is_buyer_maker, traded_at, saved_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(6))
                    ON DUPLICATE KEY UPDATE id = id
                    """;
                jdbc.batchUpdate(sql, batch);
                total += batch.size();
            }

            if (toId != null && batchMaxId >= toId) break;
            if (array.size() < 1000) break;
            currentFromId = batchMaxId + 1;
        }

        return total;
    }

    // ─── AGG_1M rollup ───────────────────────────────────────────────────────

    /**
     * 1. agg_trade_1s 있는 구간 → SQL rollup (정확한 데이터)
     * 2. 이후 여전히 빈 1분봉 구간 → Binance klines로 채움 (ON DUPLICATE KEY → 1s 결과 덮어쓰지 않음)
     */
    private int collectRollup1m(String symbol, String marketType, Long fromMs, Long toMs) throws Exception {
        int total = 0;

        // 1. agg_trade_1s 데이터 있으면 rollup
        Long s1Count = jdbc.queryForObject(
            "SELECT COUNT(*) FROM agg_trade_1s WHERE symbol=? AND market_type=? AND candle_time_ms >= ? AND candle_time_ms < ?",
            Long.class, symbol, marketType, fromMs, toMs
        );
        if (s1Count != null && s1Count > 0) {
            String sql = """
                INSERT INTO agg_trade_1m
                    (symbol, market_type, candle_time_ms,
                     open_price, high_price, low_price, close_price, vwap,
                     buy_volume, sell_volume, total_volume,
                     buy_quantity, sell_quantity, delta,
                     buy_trade_count, sell_trade_count, trade_count,
                     min_agg_trade_id, max_agg_trade_id,
                     min_first_trade_id, max_last_trade_id)
                SELECT
                    symbol, market_type,
                    FLOOR(candle_time_ms / 60000) * 60000                                                     AS candle_time_ms,
                    SUBSTRING_INDEX(MIN(CONCAT(LPAD(candle_time_ms,20,'0'),'|',open_price)),'|',-1)           AS open_price,
                    MAX(high_price)                                                                           AS high_price,
                    MIN(low_price)                                                                            AS low_price,
                    SUBSTRING_INDEX(MAX(CONCAT(LPAD(candle_time_ms,20,'0'),'|',close_price)),'|',-1)         AS close_price,
                    CASE WHEN SUM(buy_quantity + sell_quantity) = 0 THEN 0
                         ELSE SUM(total_volume) / SUM(buy_quantity + sell_quantity) END                       AS vwap,
                    SUM(buy_volume)                                                                           AS buy_volume,
                    SUM(sell_volume)                                                                          AS sell_volume,
                    SUM(total_volume)                                                                         AS total_volume,
                    SUM(buy_quantity)                                                                         AS buy_quantity,
                    SUM(sell_quantity)                                                                        AS sell_quantity,
                    SUM(buy_quantity) - SUM(sell_quantity)                                                    AS delta,
                    SUM(buy_trade_count)                                                                      AS buy_trade_count,
                    SUM(sell_trade_count)                                                                     AS sell_trade_count,
                    SUM(trade_count)                                                                          AS trade_count,
                    MIN(min_agg_trade_id)                                                                     AS min_agg_trade_id,
                    MAX(max_agg_trade_id)                                                                     AS max_agg_trade_id,
                    MIN(min_first_trade_id)                                                                   AS min_first_trade_id,
                    MAX(max_last_trade_id)                                                                    AS max_last_trade_id
                FROM agg_trade_1s
                WHERE symbol = ? AND market_type = ? AND candle_time_ms >= ? AND candle_time_ms < ?
                GROUP BY symbol, market_type, FLOOR(candle_time_ms / 60000) * 60000
                ON DUPLICATE KEY UPDATE id = id
                """;
            int s1Inserted = jdbc.update(sql, symbol, marketType, fromMs, toMs);
            log.info("[ManualBackfill] 1m {} {} 1s rollup {}건", symbol, marketType, s1Inserted);
            total += s1Inserted;
        } else {
            log.info("[ManualBackfill] 1m {} {} 1s 없음 → klines 단독 수집", symbol, marketType);
        }

        // 2. 여전히 빈 구간 → klines로 채움 (raw 결과는 ON DUPLICATE KEY로 보호)
        int klinesInserted = fillMissing1mWithKlines(symbol, marketType, fromMs, toMs);
        log.info("[ManualBackfill] 1m {} {} klines fill {}건", symbol, marketType, klinesInserted);
        total += klinesInserted;

        return total;
    }

    /** klines API로 1분봉 채우기 — raw rollup으로 이미 채워진 분은 ON DUPLICATE KEY로 스킵 */
    private int fillMissing1mWithKlines(String symbol, String marketType, long fromMs, long toMs) throws Exception {
        HttpClient client = HttpClient.newHttpClient();
        String base = "SPOT".equals(marketType) ? spotBaseUrl : futuresBaseUrl;
        String path = "SPOT".equals(marketType) ? "/api/v3/klines" : "/fapi/v1/klines";
        int LIMIT = 1500;
        int total = 0;
        long startMs = fromMs;

        String insertSql = """
            INSERT INTO agg_trade_1m
            (symbol, market_type, candle_time_ms,
             open_price, high_price, low_price, close_price, vwap,
             buy_volume, sell_volume, total_volume,
             buy_quantity, sell_quantity, delta,
             buy_trade_count, sell_trade_count, trade_count,
             min_agg_trade_id, max_agg_trade_id, min_first_trade_id, max_last_trade_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE id = id
            """;

        while (startMs < toMs) {
            String url = base + path + "?symbol=" + symbol + "&interval=1m"
                    + "&startTime=" + startMs + "&endTime=" + (toMs - 1) + "&limit=" + LIMIT;
            HttpResponse<String> response = httpGet(client, url);

            if (response.statusCode() != 200) {
                throw new IllegalStateException("klines HTTP " + response.statusCode() + ": " + response.body());
            }

            JsonNode array = mapper.readTree(response.body());
            if (!array.isArray() || array.isEmpty()) break;

            List<Object[]> batch = new ArrayList<>();
            long lastOpenTime = startMs;

            for (JsonNode k : array) {
                long      openTime  = k.get(0).asLong();
                BigDecimal open     = new BigDecimal(k.get(1).asText());
                BigDecimal high     = new BigDecimal(k.get(2).asText());
                BigDecimal low      = new BigDecimal(k.get(3).asText());
                BigDecimal close    = new BigDecimal(k.get(4).asText());
                BigDecimal baseVol  = new BigDecimal(k.get(5).asText());  // base asset qty
                BigDecimal totalVol = new BigDecimal(k.get(7).asText());  // quote asset vol
                long       trades   = k.get(8).asLong();
                BigDecimal buyQty   = new BigDecimal(k.get(9).asText());  // taker buy base
                BigDecimal buyVol   = new BigDecimal(k.get(10).asText()); // taker buy quote
                BigDecimal sellQty  = baseVol.subtract(buyQty);
                BigDecimal sellVol  = totalVol.subtract(buyVol);
                BigDecimal vwap     = baseVol.compareTo(BigDecimal.ZERO) == 0
                        ? BigDecimal.ZERO
                        : totalVol.divide(baseVol, 8, java.math.RoundingMode.HALF_UP);

                batch.add(new Object[]{
                    symbol, marketType, openTime,
                    open, high, low, close, vwap,
                    buyVol, sellVol, totalVol,
                    buyQty, sellQty, buyQty.subtract(sellQty),
                    0L, 0L, trades,   // buy/sell_trade_count 불가 → 0
                    0L, 0L, 0L, 0L    // agg_trade_id 관련 불가 → 0
                });
                if (openTime > lastOpenTime) lastOpenTime = openTime;
            }

            if (!batch.isEmpty()) {
                int[] results = jdbc.batchUpdate(insertSql, batch);
                for (int v : results) if (v == 1) total++;
            }

            if (array.size() < LIMIT) break;
            startMs = lastOpenTime + 60_000L;
        }

        return total;
    }

    // ─── AGG_5M rollup ───────────────────────────────────────────────────────

    private int collectRollup5m(String symbol, String marketType, Long fromMs, Long toMs) {
        Long oneM = jdbc.queryForObject(
            "SELECT COUNT(*) FROM agg_trade_1m WHERE symbol=? AND market_type=? AND candle_time_ms >= ? AND candle_time_ms < ?",
            Long.class, symbol, marketType, fromMs, toMs
        );
        if (oneM == null || oneM == 0) {
            throw new IllegalStateException("agg_trade_1m 선수집 필요: 해당 구간에 1분봉 데이터 없음 (" + symbol + " " + marketType + ")");
        }

        String sql = """
            INSERT INTO agg_trade_5m
                (symbol, market_type, candle_time_ms,
                 open_price, high_price, low_price, close_price, vwap,
                 buy_volume, sell_volume, total_volume,
                 buy_quantity, sell_quantity, delta,
                 buy_trade_count, sell_trade_count, trade_count,
                 min_agg_trade_id, max_agg_trade_id,
                 min_first_trade_id, max_last_trade_id)
            SELECT
                symbol, market_type,
                FLOOR(candle_time_ms / 300000) * 300000                                                       AS candle_time_ms,
                SUBSTRING_INDEX(MIN(CONCAT(LPAD(candle_time_ms,20,'0'),'|',open_price)),'|',-1)               AS open_price,
                MAX(high_price)                                                                               AS high_price,
                MIN(low_price)                                                                                AS low_price,
                SUBSTRING_INDEX(MAX(CONCAT(LPAD(candle_time_ms,20,'0'),'|',close_price)),'|',-1)             AS close_price,
                CASE WHEN SUM(buy_quantity + sell_quantity) = 0 THEN 0
                     ELSE SUM(total_volume) / SUM(buy_quantity + sell_quantity) END                           AS vwap,
                SUM(buy_volume)                                                                               AS buy_volume,
                SUM(sell_volume)                                                                              AS sell_volume,
                SUM(total_volume)                                                                             AS total_volume,
                SUM(buy_quantity)                                                                             AS buy_quantity,
                SUM(sell_quantity)                                                                            AS sell_quantity,
                SUM(buy_quantity) - SUM(sell_quantity)                                                       AS delta,
                SUM(buy_trade_count)                                                                         AS buy_trade_count,
                SUM(sell_trade_count)                                                                        AS sell_trade_count,
                SUM(trade_count)                                                                             AS trade_count,
                MIN(min_agg_trade_id)                                                                        AS min_agg_trade_id,
                MAX(max_agg_trade_id)                                                                        AS max_agg_trade_id,
                MIN(min_first_trade_id)                                                                      AS min_first_trade_id,
                MAX(max_last_trade_id)                                                                       AS max_last_trade_id
            FROM agg_trade_1m
            WHERE symbol = ? AND market_type = ? AND candle_time_ms >= ? AND candle_time_ms < ?
            GROUP BY symbol, market_type, FLOOR(candle_time_ms / 300000) * 300000
            ON DUPLICATE KEY UPDATE id = id
            """;
        return jdbc.update(sql, symbol, marketType, fromMs, toMs);
    }

    // ─── OI ──────────────────────────────────────────────────────────────────

    private int collectOi(String symbol, Long fromMs, Long toMs) throws Exception {
        HttpClient client = HttpClient.newHttpClient();
        long startMs  = fromMs != null ? fromMs : (System.currentTimeMillis() - 7 * 86_400_000L);
        long endMs    = toMs   != null ? toMs   : System.currentTimeMillis();
        long PERIOD   = 300_000L;
        int  LIMIT    = 500;
        int  total    = 0;

        while (startMs < endMs) {
            String url = "https://fapi.binance.com/futures/data/openInterestHist"
                    + "?symbol=" + symbol + "&period=5m&limit=" + LIMIT
                    + "&startTime=" + startMs + "&endTime=" + endMs;
            HttpResponse<String> response = httpGet(client, url);
            log.info("[ManualBackfill] OI {} startMs={} status={}", symbol, startMs, response.statusCode());

            if (response.statusCode() != 200) {
                throw new IllegalStateException("HTTP " + response.statusCode() + ": " + response.body());
            }

            JsonNode array = mapper.readTree(response.body());
            if (!array.isArray() || array.isEmpty()) break;

            long lastTs = startMs;
            List<Object[]> batch = new ArrayList<>();

            for (JsonNode node : array) {
                long ts = node.get("timestamp").asLong();
                batch.add(new Object[]{
                    symbol,
                    new BigDecimal(node.get("sumOpenInterest").asText()),
                    new BigDecimal(node.get("sumOpenInterestValue").asText()),
                    null,
                    ts
                });
                if (ts > lastTs) lastTs = ts;
            }

            String sql = """
                INSERT INTO open_interest (symbol, open_interest, oi_value, price, collected_at_ms)
                VALUES (?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE price = COALESCE(price, VALUES(price))
                """;
            jdbc.batchUpdate(sql, batch);
            total += batch.size();

            if (array.size() < LIMIT) break;
            startMs = lastTs + PERIOD;
        }

        return total;
    }

    // ─── HTTP util ───────────────────────────────────────────────────────────

    private HttpResponse<String> httpGet(HttpClient client, String url) throws Exception {
        HttpRequest req = HttpRequest.newBuilder()
                .uri(URI.create(url))
                .timeout(Duration.ofSeconds(15))
                .GET()
                .build();
        return client.send(req, HttpResponse.BodyHandlers.ofString());
    }
}
