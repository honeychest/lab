// [AGENT] 1분봉·5분봉 롤업 스케줄러 — agg_trade_1s → agg_trade_1m / agg_trade_1m → agg_trade_5m
// 연관파일: AggTrade1m.java, AggTrade5m.java, AggTrade1mRepository.java, AggTrade5mRepository.java, AggTrade1sRollupService.java, CandleStreamService.java(CandleCompletedEvent 수신)
// 주요메서드: rollup1m() @Scheduled(10 * * * * *), rollup5m() @Scheduled(30 */5 * * * *)
// catchUp(): 1s catchUp 완료 후 체이닝 실행 (CompletableFuture)
package com.chs.springboot.domain.binance.service;

import com.chs.springboot.domain.binance.model.AggTrade1m;
import com.chs.springboot.domain.binance.model.AggTrade5m;
import com.chs.springboot.domain.binance.model.event.Candle1mCompletedEvent;
import com.chs.springboot.domain.binance.model.event.CandleCompletedEvent;
import com.chs.springboot.domain.binance.repository.AggTrade1mRepository;
import com.chs.springboot.domain.binance.repository.AggTrade5mRepository;
import com.chs.springboot.domain.binance.repository.AggTradeCollectStatusRepository;
import com.chs.springboot.global.redis.LeaderElectionService;
import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Duration;
import java.util.List;
import java.util.Map;

@Slf4j
@Service
@RequiredArgsConstructor
public class AggTradeRollupService {

    private static final String CATCHUP_LOCK_KEY = "aggtrade:rollup:catchup:lock";

    private final LeaderElectionService leaderElectionService;
    private final AggTrade1mRepository agg1mRepository;
    private final AggTrade5mRepository agg5mRepository;
    private final AggTradeCollectStatusRepository statusRepository;
    private final StringRedisTemplate redisTemplate;
    private final JdbcTemplate jdbcTemplate;
    private final AggTrade1sRollupService agg1sRollupService;
    private final org.springframework.context.ApplicationEventPublisher eventPublisher;

    // ─── 기동 시 catch-up (1s catchUp 완료 후 체이닝) ────────────────────

    @PostConstruct
    public void catchUp() {
        log.info("[RollupCatchUp] catchUp() 호출됨, 1s future 대기 시작");
        agg1sRollupService.getCatchUpFuture()
            .exceptionally(e -> {
                log.error("[RollupCatchUp] 1s catchUp 실패로 1m/5m catchUp 미실행: {}", e.getMessage(), e);
                return null;
            })
            .thenRunAsync(() -> {
                log.info("[RollupCatchUp] 1s future 완료, runCatchUp 진입");
                runCatchUp();
            });
    }

    private void runCatchUp() {
        boolean locked = Boolean.TRUE.equals(
            redisTemplate.opsForValue().setIfAbsent(CATCHUP_LOCK_KEY, "locked", Duration.ofMinutes(10))
        );
        if (!locked) {
            log.info("[RollupCatchUp] 다른 서버가 실행 중, skip");
            return;
        }
        try {
            var targets = statusRepository.findByEnabledTrue();
            long nowMs = currentMinuteStartMs(); // 진행 중인 분은 제외

            // 1m 먼저 전부 채운 뒤 5m 진행 (정합성)
            for (var t : targets) {
                catchUp1m(t.getSymbol(), t.getMarketType(), nowMs);
            }
            for (var t : targets) {
                catchUp5m(t.getSymbol(), t.getMarketType(), nowMs);
            }
            log.info("[RollupCatchUp] 완료");
        } catch (Exception e) {
            log.error("[RollupCatchUp] 실패: {}", e.getMessage(), e);
        } finally {
            redisTemplate.delete(CATCHUP_LOCK_KEY);
        }
    }

    private void catchUp1m(String symbol, String marketType, long nowMs) {
        Long lastMs = agg1mRepository
            .findMaxCandleTimeMsBySymbolAndMarketType(symbol, marketType)
            .orElse(null);
        long fromMs;
        if (lastMs == null) {
            Long firstMs = jdbcTemplate.queryForObject(
                "SELECT MIN(candle_time_ms) FROM agg_trade_1s WHERE symbol = ? AND market_type = ?",
                Long.class, symbol, marketType);
            Long lastAvailMs = jdbcTemplate.queryForObject(
                "SELECT MAX(candle_time_ms) FROM agg_trade_1s WHERE symbol = ? AND market_type = ?",
                Long.class, symbol, marketType);
            log.info("[RollupCatchUp] {} {} 1m lastMs=null, 1s범위={} ~ {}", symbol, marketType, firstMs, lastAvailMs);
            if (firstMs == null) {
                log.info("[RollupCatchUp] {} {} 1s 데이터 없음, skip", symbol, marketType);
                return;
            }
            fromMs = (firstMs / 60_000L) * 60_000L;
        } else {
            Long lastAvailMs = jdbcTemplate.queryForObject(
                "SELECT MAX(candle_time_ms) FROM agg_trade_1s WHERE symbol = ? AND market_type = ?",
                Long.class, symbol, marketType);
            log.info("[RollupCatchUp] {} {} 1m lastMs={}, 1s MAX={}", symbol, marketType, lastMs, lastAvailMs);
            fromMs = lastMs + 60_000L;
        }
        if (fromMs >= nowMs) {
            log.info("[RollupCatchUp] {} {} 1m fromMs={} >= nowMs={}, skip", symbol, marketType, fromMs, nowMs);
            return;
        }

        log.info("[RollupCatchUp] {} {} 1m catch-up {} ~ {}", symbol, marketType, fromMs, nowMs);

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
                FLOOR(candle_time_ms / 60000) * 60000                                                          AS candle_time_ms,
                SUBSTRING_INDEX(MIN(CONCAT(LPAD(candle_time_ms,20,'0'),'|',open_price)),'|',-1)                AS open_price,
                MAX(high_price)                                                                                AS high_price,
                MIN(low_price)                                                                                 AS low_price,
                SUBSTRING_INDEX(MAX(CONCAT(LPAD(candle_time_ms,20,'0'),'|',close_price)),'|',-1)               AS close_price,
                CASE WHEN SUM(buy_quantity + sell_quantity) = 0 THEN 0
                     ELSE SUM(total_volume) / SUM(buy_quantity + sell_quantity) END                            AS vwap,
                SUM(buy_volume)                                                                                AS buy_volume,
                SUM(sell_volume)                                                                               AS sell_volume,
                SUM(total_volume)                                                                              AS total_volume,
                SUM(buy_quantity)                                                                              AS buy_quantity,
                SUM(sell_quantity)                                                                             AS sell_quantity,
                SUM(buy_quantity) - SUM(sell_quantity)                                                         AS delta,
                SUM(buy_trade_count)                                                                           AS buy_trade_count,
                SUM(sell_trade_count)                                                                          AS sell_trade_count,
                SUM(trade_count)                                                                               AS trade_count,
                MIN(min_agg_trade_id)                                                                          AS min_agg_trade_id,
                MAX(max_agg_trade_id)                                                                          AS max_agg_trade_id,
                MIN(min_first_trade_id)                                                                        AS min_first_trade_id,
                MAX(max_last_trade_id)                                                                         AS max_last_trade_id
            FROM agg_trade_1s
            WHERE symbol = ? AND market_type = ? AND candle_time_ms >= ? AND candle_time_ms < ?
            GROUP BY symbol, market_type, FLOOR(candle_time_ms / 60000) * 60000
            ON DUPLICATE KEY UPDATE id = id
            """;
        int rows = jdbcTemplate.update(sql, symbol, marketType, fromMs, nowMs);
        log.info("[RollupCatchUp] {} {} 1m {}건 삽입", symbol, marketType, rows);
    }

    private void catchUp5m(String symbol, String marketType, long nowMs) {
        Long lastMs = agg5mRepository
            .findMaxCandleTimeMsBySymbolAndMarketType(symbol, marketType)
            .orElse(null);
        long fromMs;
        if (lastMs == null) {
            Long firstMs = jdbcTemplate.queryForObject(
                "SELECT MIN(candle_time_ms) FROM agg_trade_1m WHERE symbol = ? AND market_type = ?",
                Long.class, symbol, marketType);
            if (firstMs == null) {
                log.info("[RollupCatchUp] {} {} 1m 데이터 없음, skip", symbol, marketType);
                return;
            }
            fromMs = (firstMs / 300_000L) * 300_000L;
        } else {
            fromMs = lastMs + 300_000L;
        }
        long to5mMs = (nowMs / 300_000L) * 300_000L; // nowMs 기준 현재 5분 구간 시작 (미완료 구간 제외)
        if (fromMs >= to5mMs) return;

        log.info("[RollupCatchUp] {} {} 5m catch-up {} ~ {}", symbol, marketType, fromMs, to5mMs);

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
                SUM(buy_quantity) - SUM(sell_quantity)                                                        AS delta,
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
        int rows = jdbcTemplate.update(sql, symbol, marketType, fromMs, to5mMs);
        log.info("[RollupCatchUp] {} {} 5m {}건 삽입", symbol, marketType, rows);
    }

    // ─── 1분봉 롤업 (매 분 :10초) — agg_trade_1s → agg_trade_1m ────────────

    @Scheduled(cron = "10 * * * * *")
    public void rollup1m() {
        if (!leaderElectionService.isLeader()) return;

        long endMs   = currentMinuteStartMs();
        long startMs = endMs - 60_000L;

        List<Map<String, Object>> rows = aggregateFrom1sCandles(startMs, endMs);
        for (Map<String, Object> row : rows) {
            AggTrade1m candle = new AggTrade1m();
            fill1mCandle(candle, row, startMs);
            agg1mRepository.insertIgnoreDuplicate(candle);
            log.debug("[Rollup1m] {} {} 집계 완료", candle.getSymbol(), candle.getMarketType());
            eventPublisher.publishEvent(new Candle1mCompletedEvent(this, candle));
        }
    }

    // ─── 5분봉 롤업 (매 5분 :30초) — agg_trade_1m → agg_trade_5m ───────────
    // :10초에 1분봉이 생성되므로 20초 여유를 두고 :30초에 실행

    @Scheduled(cron = "30 */5 * * * *")
    public void rollup5m() {
        if (!leaderElectionService.isLeader()) return;

        long endMs   = current5mStartMs();
        long startMs = endMs - 300_000L;

        List<Map<String, Object>> rows = aggregateFrom1mCandles(startMs, endMs);
        for (Map<String, Object> row : rows) {
            AggTrade5m candle = new AggTrade5m();
            fill5mCandle(candle, row);
            agg5mRepository.insertIgnoreDuplicate(candle);
            log.debug("[Rollup5m] {} {} 집계 완료", candle.getSymbol(), candle.getMarketType());
            eventPublisher.publishEvent(new CandleCompletedEvent(this, candle));
        }
    }

    // ─── 1m: agg_trade_1s 집계 ───────────────────────────────────────────

    private List<Map<String, Object>> aggregateFrom1sCandles(long startMs, long endMs) {
        String sql = """
            SELECT
                symbol,
                market_type,
                SUBSTRING_INDEX(MIN(CONCAT(LPAD(candle_time_ms,20,'0'),'|',open_price)),'|',-1)  AS open_price,
                MAX(high_price)                                                                   AS high_price,
                MIN(low_price)                                                                    AS low_price,
                SUBSTRING_INDEX(MAX(CONCAT(LPAD(candle_time_ms,20,'0'),'|',close_price)),'|',-1) AS close_price,
                SUM(buy_volume)                                                                   AS buy_volume,
                SUM(sell_volume)                                                                  AS sell_volume,
                SUM(total_volume)                                                                 AS total_volume,
                SUM(buy_quantity)                                                                 AS buy_quantity,
                SUM(sell_quantity)                                                                AS sell_quantity,
                SUM(buy_trade_count)                                                              AS buy_trade_count,
                SUM(sell_trade_count)                                                             AS sell_trade_count,
                SUM(trade_count)                                                                  AS trade_count,
                MIN(min_agg_trade_id)                                                             AS min_agg_trade_id,
                MAX(max_agg_trade_id)                                                             AS max_agg_trade_id,
                MIN(min_first_trade_id)                                                           AS min_first_trade_id,
                MAX(max_last_trade_id)                                                            AS max_last_trade_id
            FROM agg_trade_1s
            WHERE candle_time_ms >= ? AND candle_time_ms < ?
            GROUP BY symbol, market_type
            """;
        return jdbcTemplate.queryForList(sql, startMs, endMs);
    }

    // ─── 5m: agg_trade_1m 집계 ────────────────────────────────────────────

    private List<Map<String, Object>> aggregateFrom1mCandles(long startMs, long endMs) {
        String sql = """
            SELECT
                symbol,
                market_type,
                MIN(candle_time_ms)     AS candle_time_ms,
                MIN(low_price)          AS low_price,
                MAX(high_price)         AS high_price,
                SUM(buy_volume)         AS buy_volume,
                SUM(sell_volume)        AS sell_volume,
                SUM(total_volume)       AS total_volume,
                SUM(buy_quantity)       AS buy_quantity,
                SUM(sell_quantity)      AS sell_quantity,
                SUM(buy_trade_count)    AS buy_trade_count,
                SUM(sell_trade_count)   AS sell_trade_count,
                SUM(trade_count)        AS trade_count,
                MIN(min_agg_trade_id)   AS min_agg_trade_id,
                MAX(max_agg_trade_id)   AS max_agg_trade_id,
                MIN(min_first_trade_id) AS min_first_trade_id,
                MAX(max_last_trade_id)  AS max_last_trade_id
            FROM agg_trade_1m
            WHERE candle_time_ms >= ? AND candle_time_ms < ?
            GROUP BY symbol, market_type
            """;
        return jdbcTemplate.queryForList(sql, startMs, endMs);
    }

    // ─── fillCandle ───────────────────────────────────────────────────────

    private void fill1mCandle(AggTrade1m c, Map<String, Object> row, long startMs) {
        c.setSymbol((String) row.get("symbol"));
        c.setMarketType((String) row.get("market_type"));
        c.setCandleTimeMs(startMs);
        c.setOpenPrice(toBd(row.get("open_price")));
        c.setHighPrice(toBd(row.get("high_price")));
        c.setLowPrice(toBd(row.get("low_price")));
        c.setClosePrice(toBd(row.get("close_price")));
        c.setBuyVolume(toBd(row.get("buy_volume")));
        c.setSellVolume(toBd(row.get("sell_volume")));
        c.setTotalVolume(toBd(row.get("total_volume")));
        c.setBuyQuantity(toBd(row.get("buy_quantity")));
        c.setSellQuantity(toBd(row.get("sell_quantity")));
        c.setDelta(c.getBuyQuantity().subtract(c.getSellQuantity()));
        c.setBuyTradeCount(toLong(row.get("buy_trade_count")));
        c.setSellTradeCount(toLong(row.get("sell_trade_count")));
        c.setTradeCount(toLong(row.get("trade_count")));
        c.setMinAggTradeId(toLong(row.get("min_agg_trade_id")));
        c.setMaxAggTradeId(toLong(row.get("max_agg_trade_id")));
        c.setMinFirstTradeId(toLong(row.get("min_first_trade_id")));
        c.setMaxLastTradeId(toLong(row.get("max_last_trade_id")));

        BigDecimal totalQty = c.getBuyQuantity().add(c.getSellQuantity());
        c.setVwap(totalQty.compareTo(BigDecimal.ZERO) == 0
            ? BigDecimal.ZERO
            : c.getTotalVolume().divide(totalQty, 8, RoundingMode.HALF_UP));
    }

    private void fill5mCandle(AggTrade5m c, Map<String, Object> row) {
        long startMs = toLong(row.get("candle_time_ms"));
        long endMs   = startMs + 300_000L;

        c.setSymbol((String) row.get("symbol"));
        c.setMarketType((String) row.get("market_type"));
        c.setCandleTimeMs(startMs);
        c.setOpenPrice(get1mFirstPrice((String) row.get("symbol"), (String) row.get("market_type"), startMs, endMs));
        c.setClosePrice(get1mLastPrice((String) row.get("symbol"), (String) row.get("market_type"), startMs, endMs));
        c.setHighPrice(toBd(row.get("high_price")));
        c.setLowPrice(toBd(row.get("low_price")));
        c.setBuyVolume(toBd(row.get("buy_volume")));
        c.setSellVolume(toBd(row.get("sell_volume")));
        c.setTotalVolume(toBd(row.get("total_volume")));
        c.setBuyQuantity(toBd(row.get("buy_quantity")));
        c.setSellQuantity(toBd(row.get("sell_quantity")));
        c.setDelta(c.getBuyQuantity().subtract(c.getSellQuantity()));
        c.setBuyTradeCount(toLong(row.get("buy_trade_count")));
        c.setSellTradeCount(toLong(row.get("sell_trade_count")));
        c.setTradeCount(toLong(row.get("trade_count")));
        c.setMinAggTradeId(toLong(row.get("min_agg_trade_id")));
        c.setMaxAggTradeId(toLong(row.get("max_agg_trade_id")));
        c.setMinFirstTradeId(toLong(row.get("min_first_trade_id")));
        c.setMaxLastTradeId(toLong(row.get("max_last_trade_id")));

        BigDecimal totalQty = c.getBuyQuantity().add(c.getSellQuantity());
        c.setVwap(totalQty.compareTo(BigDecimal.ZERO) == 0
            ? BigDecimal.ZERO
            : c.getTotalVolume().divide(totalQty, 8, RoundingMode.HALF_UP));
    }

    // ─── open/close 가격 조회 (5m용) ─────────────────────────────────────

    private BigDecimal get1mFirstPrice(String symbol, String marketType, long startMs, long endMs) {
        String sql = """
            SELECT open_price FROM agg_trade_1m
            WHERE symbol = ? AND market_type = ? AND candle_time_ms >= ? AND candle_time_ms < ?
            ORDER BY candle_time_ms ASC
            LIMIT 1
            """;
        List<BigDecimal> result = jdbcTemplate.queryForList(sql, BigDecimal.class, symbol, marketType, startMs, endMs);
        return result.isEmpty() ? BigDecimal.ZERO : result.get(0);
    }

    private BigDecimal get1mLastPrice(String symbol, String marketType, long startMs, long endMs) {
        String sql = """
            SELECT close_price FROM agg_trade_1m
            WHERE symbol = ? AND market_type = ? AND candle_time_ms >= ? AND candle_time_ms < ?
            ORDER BY candle_time_ms DESC
            LIMIT 1
            """;
        List<BigDecimal> result = jdbcTemplate.queryForList(sql, BigDecimal.class, symbol, marketType, startMs, endMs);
        return result.isEmpty() ? BigDecimal.ZERO : result.get(0);
    }

    // ─── 시각 계산 ────────────────────────────────────────────────────────

    /** 현재 분의 시작 ms (초·나노 버림) */
    private long currentMinuteStartMs() {
        long now = System.currentTimeMillis();
        return (now / 60_000L) * 60_000L;
    }

    /** 현재 5분 구간의 시작 ms */
    private long current5mStartMs() {
        long now = System.currentTimeMillis();
        return (now / 300_000L) * 300_000L;
    }

    // ─── 유틸 ─────────────────────────────────────────────────────────────

    private BigDecimal toBd(Object v) {
        if (v == null) return BigDecimal.ZERO;
        if (v instanceof BigDecimal bd) return bd;
        return new BigDecimal(v.toString());
    }

    private long toLong(Object v) {
        if (v == null) return 0L;
        return ((Number) v).longValue();
    }
}
