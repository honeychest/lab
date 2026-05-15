package com.chs.springboot.domain.binance.service.rawwriter;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Service
public class AggTradeRawWriterDryRunVerifier {

    private static final int MAX_SUMMARIES = 50;
    private static final long WINDOW_MS = 10_000L;
    private static final long FINALIZE_GRACE_MS = 5_000L;

    private final Deque<AggTradeRawWriterDryRunSummary> summaries = new ArrayDeque<>();
    private final Map<String, KafkaWindowAccumulator> openWindows = new LinkedHashMap<>();
    private final JdbcTemplate jdbcTemplate;
    private final boolean enabled;
    private final boolean dryRun;
    private final long startedAtMs;

    @Autowired
    public AggTradeRawWriterDryRunVerifier(
            JdbcTemplate jdbcTemplate,
            @Value("${binance.agg-trade.raw-writer.enabled:false}") boolean enabled,
            @Value("${binance.agg-trade.raw-writer.dry-run:true}") boolean dryRun
    ) {
        this(jdbcTemplate, enabled, dryRun, System.currentTimeMillis());
    }

    AggTradeRawWriterDryRunVerifier(JdbcTemplate jdbcTemplate,
                                    boolean enabled,
                                    boolean dryRun,
                                    long startedAtMs) {
        this.jdbcTemplate = jdbcTemplate;
        this.enabled = enabled;
        this.dryRun = dryRun;
        this.startedAtMs = startedAtMs;
    }

    public synchronized void add(AggTradeRawWriterDryRunSummary summary) {
        summaries.addFirst(summary);
        while (summaries.size() > MAX_SUMMARIES) {
            summaries.removeLast();
        }
    }

    public synchronized AggTradeRawWriterSummaryResponse snapshot() {
        return new AggTradeRawWriterSummaryResponse(enabled, dryRun, List.copyOf(new ArrayList<>(summaries)));
    }

    public synchronized void discardInFlightVerification() {
        openWindows.clear();
    }

    public synchronized void accumulate(AggTradeRawWriterKafkaWindowEvent event) {
        long windowStart = windowStart(event.tradedAt());
        String key = event.symbol() + "|" + event.marketType() + "|" + windowStart;
        openWindows.computeIfAbsent(key, ignored -> new KafkaWindowAccumulator(
                event.symbol(),
                event.marketType(),
                windowStart,
                windowStart + WINDOW_MS,
                startedAtMs
        )).add(event);
    }

    public synchronized void finalizeWindowsBefore(long exclusiveWindowEndMs) {
        List<String> finalizedKeys = new ArrayList<>();
        openWindows.forEach((key, accumulator) -> {
            if (accumulator.windowEndMs + FINALIZE_GRACE_MS <= exclusiveWindowEndMs) {
                AggTradeRawWriterDbWindowStats dbStats = lookupDbStats(
                        accumulator.symbol,
                        accumulator.marketType,
                        accumulator.windowStartMs,
                        accumulator.windowEndMs
                );
                add(accumulator.toSummary(dbStats));
                finalizedKeys.add(key);
            }
        });
        finalizedKeys.forEach(openWindows::remove);
    }

    public AggTradeRawWriterDbWindowStats lookupDbStats(String symbol, String marketType, long startMs, long endMs) {
        String sql = """
                SELECT COUNT(*) AS row_count,
                       MIN(agg_trade_id) AS min_agg_trade_id,
                       MAX(agg_trade_id) AS max_agg_trade_id,
                       MIN(traded_at) AS min_traded_at,
                       MAX(traded_at) AS max_traded_at
                FROM raw_agg_trade
                WHERE symbol = ?
                  AND market_type = ?
                  AND traded_at >= ?
                  AND traded_at < ?
                """;
        return jdbcTemplate.queryForObject(sql, (rs, rowNum) -> new AggTradeRawWriterDbWindowStats(
                rs.getInt("row_count"),
                rs.getObject("min_agg_trade_id", Long.class),
                rs.getObject("max_agg_trade_id", Long.class),
                rs.getObject("min_traded_at", Long.class),
                rs.getObject("max_traded_at", Long.class)
        ), symbol, marketType, startMs, endMs);
    }

    private long windowStart(long tradedAt) {
        return tradedAt - (tradedAt % WINDOW_MS);
    }

    private static final class KafkaWindowAccumulator {
        private final String symbol;
        private final String marketType;
        private final long windowStartMs;
        private final long windowEndMs;
        private final long startedAtMs;
        private int kafkaCount;
        private int invalidCount;
        private Long minAggTradeId;
        private Long maxAggTradeId;
        private Long minTradedAt;
        private Long maxTradedAt;
        private final List<Long> sampleIds = new ArrayList<>();

        private KafkaWindowAccumulator(String symbol,
                                       String marketType,
                                       long windowStartMs,
                                       long windowEndMs,
                                       long startedAtMs) {
            this.symbol = symbol;
            this.marketType = marketType;
            this.windowStartMs = windowStartMs;
            this.windowEndMs = windowEndMs;
            this.startedAtMs = startedAtMs;
        }

        private void add(AggTradeRawWriterKafkaWindowEvent event) {
            kafkaCount++;
            invalidCount += event.invalidCount();
            minAggTradeId = min(minAggTradeId, event.aggTradeId());
            maxAggTradeId = max(maxAggTradeId, event.aggTradeId());
            minTradedAt = min(minTradedAt, event.tradedAt());
            maxTradedAt = max(maxTradedAt, event.tradedAt());
            if (sampleIds.size() < 8) {
                sampleIds.add(event.aggTradeId());
            }
        }

        private AggTradeRawWriterDryRunSummary toSummary(AggTradeRawWriterDbWindowStats dbStats) {
            boolean partialWindow = windowStartMs < startedAtMs && startedAtMs < windowEndMs;
            boolean countMatched = kafkaCount == dbStats.count();
            boolean rangeMatched = equalsNullable(minAggTradeId, dbStats.minAggTradeId())
                    && equalsNullable(maxAggTradeId, dbStats.maxAggTradeId());
            String comparisonStatus = partialWindow
                    ? "PARTIAL"
                    : (countMatched && rangeMatched ? "OK" : "CHECK");
            return new AggTradeRawWriterDryRunSummary(
                    UUID.randomUUID().toString(),
                    windowStartMs,
                    windowEndMs,
                    symbol,
                    marketType,
                    kafkaCount,
                    dbStats.count(),
                    minAggTradeId,
                    maxAggTradeId,
                    dbStats.minAggTradeId(),
                    dbStats.maxAggTradeId(),
                    minTradedAt,
                    maxTradedAt,
                    dbStats.minTradedAt(),
                    dbStats.maxTradedAt(),
                    invalidCount,
                    List.copyOf(sampleIds),
                    countMatched,
                    rangeMatched,
                    partialWindow,
                    comparisonStatus
            );
        }

        private Long min(Long current, long candidate) {
            return current == null ? candidate : Math.min(current, candidate);
        }

        private Long max(Long current, long candidate) {
            return current == null ? candidate : Math.max(current, candidate);
        }

        private boolean equalsNullable(Long left, Long right) {
            return left == null ? right == null : left.equals(right);
        }
    }
}
