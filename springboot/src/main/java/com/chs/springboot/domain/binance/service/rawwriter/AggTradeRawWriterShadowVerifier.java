package com.chs.springboot.domain.binance.service.rawwriter;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Service
public class AggTradeRawWriterShadowVerifier {

    private final JdbcTemplate jdbcTemplate;

    public AggTradeRawWriterShadowVerifier(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public AggTradeRawWriterShadowCompareResponse compareRecent(int minutes) {
        int safeMinutes = Math.max(1, Math.min(minutes, 24 * 60));
        long sinceMs = System.currentTimeMillis() - safeMinutes * 60_000L;
        Map<String, TableStats> rawStats = loadStats("raw_agg_trade", sinceMs);
        Map<String, TableStats> shadowStats = loadStats("raw_agg_trade_test", sinceMs);
        Map<String, AggTradeRawWriterShadowCompareRow> rows = new LinkedHashMap<>();

        rawStats.forEach((key, raw) -> rows.put(key, toRow(raw, shadowStats.get(key))));
        shadowStats.forEach((key, shadow) -> rows.putIfAbsent(key, toRow(rawStats.get(key), shadow)));

        return new AggTradeRawWriterShadowCompareResponse(safeMinutes, List.copyOf(rows.values()));
    }

    private Map<String, TableStats> loadStats(String tableName, long sinceMs) {
        String sql = """
                SELECT symbol,
                       market_type,
                       COUNT(*) AS row_count,
                       MIN(agg_trade_id) AS min_agg_trade_id,
                       MAX(agg_trade_id) AS max_agg_trade_id
                FROM %s
                WHERE traded_at >= ?
                GROUP BY symbol, market_type
                ORDER BY symbol, market_type
                """.formatted(tableName);
        Map<String, TableStats> stats = new LinkedHashMap<>();
        jdbcTemplate.query(sql, rs -> {
            TableStats row = new TableStats(
                    rs.getString("symbol"),
                    rs.getString("market_type"),
                    rs.getLong("row_count"),
                    rs.getObject("min_agg_trade_id", Long.class),
                    rs.getObject("max_agg_trade_id", Long.class)
            );
            stats.put(row.symbol + "|" + row.marketType, row);
        }, sinceMs);
        return stats;
    }

    private AggTradeRawWriterShadowCompareRow toRow(TableStats raw, TableStats shadow) {
        String symbol = raw != null ? raw.symbol : shadow.symbol;
        String marketType = raw != null ? raw.marketType : shadow.marketType;
        long rawCount = raw != null ? raw.count : 0;
        long shadowCount = shadow != null ? shadow.count : 0;
        boolean matched = rawCount == shadowCount
                && equalsNullable(raw != null ? raw.minAggTradeId : null, shadow != null ? shadow.minAggTradeId : null)
                && equalsNullable(raw != null ? raw.maxAggTradeId : null, shadow != null ? shadow.maxAggTradeId : null);
        return new AggTradeRawWriterShadowCompareRow(
                symbol,
                marketType,
                rawCount,
                shadowCount,
                rawCount - shadowCount,
                raw != null ? raw.minAggTradeId : null,
                raw != null ? raw.maxAggTradeId : null,
                shadow != null ? shadow.minAggTradeId : null,
                shadow != null ? shadow.maxAggTradeId : null,
                matched ? "OK" : "CHECK"
        );
    }

    private boolean equalsNullable(Long left, Long right) {
        return left == null ? right == null : left.equals(right);
    }

    private record TableStats(
            String symbol,
            String marketType,
            long count,
            Long minAggTradeId,
            Long maxAggTradeId
    ) {
    }
}
