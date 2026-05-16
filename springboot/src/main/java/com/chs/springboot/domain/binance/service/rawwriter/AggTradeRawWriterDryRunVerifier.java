package com.chs.springboot.domain.binance.service.rawwriter;

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

/**
 * DRY_RUN 모드에서 Kafka 수신 데이터와 DB 저장 데이터를 10초 윈도우 단위로 비교·검증한다.
 * 컨슈머가 {@code accumulate()}로 이벤트를 누적하고,
 * {@code finalizeWindowsBefore()}로 완료된 윈도우를 DB와 대조해 summary를 생성한다.
 */
@Service
public class AggTradeRawWriterDryRunVerifier {

    private static final int MAX_SUMMARIES = 50;          // 보관할 최대 summary 건수
    private static final long FINALIZE_GRACE_MS = 5_000L; // 윈도우 마감 유예 시간 (5초)

    private final Deque<AggTradeRawWriterDryRunSummary> summaries = new ArrayDeque<>(); // 완료된 비교 결과 (최신순)
    private final Map<String, KafkaWindowAccumulator> openWindows = new LinkedHashMap<>(); // 진행 중인 윈도우 누적 버퍼
    private final JdbcTemplate jdbcTemplate;
    private final KafkaPipelineSwitchboard switchboard;
    private final long startedAtMs; // 서비스 시작 시각 — PARTIAL 윈도우 판정 기준

    @Autowired
    public AggTradeRawWriterDryRunVerifier(
            JdbcTemplate jdbcTemplate,
            KafkaPipelineSwitchboard switchboard
    ) {
        this(jdbcTemplate, switchboard, System.currentTimeMillis());
    }

    AggTradeRawWriterDryRunVerifier(JdbcTemplate jdbcTemplate,
                                    KafkaPipelineSwitchboard switchboard,
                                    long startedAtMs) {
        this.jdbcTemplate = jdbcTemplate;
        this.switchboard = switchboard;
        this.startedAtMs = startedAtMs;
    }

    public synchronized void add(AggTradeRawWriterDryRunSummary summary) {
        summaries.addFirst(summary);
        while (summaries.size() > MAX_SUMMARIES) {
            summaries.removeLast();
        }
    }

    public synchronized AggTradeRawWriterSummaryResponse snapshot() {
        KafkaPipelineExecutionPlan plan = switchboard.aggTradeRawWriterPlan();
        return new AggTradeRawWriterSummaryResponse(
                plan.mode(),
                plan.enabled(),
                plan.dryRun(),
                plan.targetTable(),
                List.copyOf(new ArrayList<>(summaries))
        );
    }

    /** 파이프라인 모드 전환 시 미완료 윈도우 버퍼를 전부 폐기한다. */
    public synchronized void discardInFlightVerification() {
        openWindows.clear();
    }

    /**
     * Kafka 이벤트를 해당 윈도우의 누적 버퍼에 추가한다.
     * 윈도우 키: symbol|marketType|windowStart
     */
    public synchronized void accumulate(AggTradeRawWriterKafkaWindowEvent event) {
        KafkaWindow window = KafkaWindow.of(event.tradedAt(), KafkaWindow.RAW_WRITER_DRY_RUN_WINDOW_MS);
        String key = event.symbol() + "|" + event.marketType() + "|" + window.startMs();
        openWindows.computeIfAbsent(key, ignored -> new KafkaWindowAccumulator(
                event.symbol(),
                event.marketType(),
                window.startMs(),
                window.endMs(),
                startedAtMs
        )).add(event);
    }

    /**
     * {@code exclusiveWindowEndMs} 이전에 종료된 윈도우를 DB와 대조해 summary로 마감한다.
     * 유예 시간(5초)을 두어 DB 쓰기 지연을 허용한다.
     */
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

    /** 지정 윈도우 구간에 해당하는 DB 집계 통계를 조회한다. */
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

    /**
     * 하나의 10초 윈도우에 대한 Kafka 이벤트 누적 버퍼.
     * {@code finalizeWindowsBefore()} 호출 시 DB 통계와 비교해 {@link AggTradeRawWriterDryRunSummary}로 변환된다.
     */
    private static final class KafkaWindowAccumulator {
        private final String symbol;
        private final String marketType;
        private final long windowStartMs;
        private final long windowEndMs;
        private final long startedAtMs;   // PARTIAL 판정용 서비스 시작 시각
        private int kafkaCount;           // 누적 이벤트 수
        private int invalidCount;         // 누적 무효 건수
        private Long minAggTradeId;
        private Long maxAggTradeId;
        private Long minTradedAt;
        private Long maxTradedAt;
        private final List<Long> sampleIds = new ArrayList<>(); // 대표 샘플 (최대 8건)

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

        /**
         * 누적된 Kafka 통계와 DB 통계를 비교해 summary를 생성한다.
         * 서비스 시작 시점이 윈도우 내에 있으면 PARTIAL, 건수·범위 일치 시 OK, 불일치 시 CHECK.
         */
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
