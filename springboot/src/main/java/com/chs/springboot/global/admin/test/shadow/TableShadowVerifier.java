package com.chs.springboot.global.admin.test.shadow;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Service
public class TableShadowVerifier {

    private final JdbcTemplate jdbcTemplate;

    public TableShadowVerifier(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public TableShadowCompareResponse compareRecent(TableShadowProfile profile, int minutes) {
        int safeMinutes = Math.max(1, Math.min(minutes, 24 * 60));
        long sinceMs = System.currentTimeMillis() - safeMinutes * 60_000L;
        Map<String, TableStats> rawStats = loadStats(profile, profile.rawTable(), sinceMs);
        Map<String, TableStats> shadowStats = loadStats(profile, profile.shadowTable(), sinceMs);
        Map<String, TableShadowCompareRow> rows = new LinkedHashMap<>();

        rawStats.forEach((key, raw) -> rows.put(key, toRow(raw, shadowStats.get(key))));
        shadowStats.forEach((key, shadow) -> rows.putIfAbsent(key, toRow(rawStats.get(key), shadow)));

        return new TableShadowCompareResponse(profile.id(), safeMinutes, List.copyOf(rows.values()));
    }

    private Map<String, TableStats> loadStats(TableShadowProfile profile, String tableName, long sinceMs) {
        String sql = """
                SELECT %s AS symbol,
                       %s AS market_type,
                       COUNT(*) AS row_count,
                       MIN(%s) AS min_sequence,
                       MAX(%s) AS max_sequence
                FROM %s
                WHERE %s >= ?
                GROUP BY %s, %s
                ORDER BY %s, %s
                """.formatted(
                profile.symbolColumn(),
                profile.marketTypeColumn(),
                profile.sequenceColumn(),
                profile.sequenceColumn(),
                tableName,
                profile.timeColumn(),
                profile.symbolColumn(),
                profile.marketTypeColumn(),
                profile.symbolColumn(),
                profile.marketTypeColumn()
        );
        Map<String, TableStats> stats = new LinkedHashMap<>();
        jdbcTemplate.query(sql, rs -> {
            TableStats row = new TableStats(
                    rs.getString("symbol"),
                    rs.getString("market_type"),
                    rs.getLong("row_count"),
                    rs.getObject("min_sequence", Long.class),
                    rs.getObject("max_sequence", Long.class)
            );
            stats.put(row.symbol + "|" + row.marketType, row);
        }, sinceMs);
        return stats;
    }

    private TableShadowCompareRow toRow(TableStats raw, TableStats shadow) {
        String symbol = raw != null ? raw.symbol : shadow.symbol;
        String marketType = raw != null ? raw.marketType : shadow.marketType;
        long rawCount = raw != null ? raw.count : 0;
        long shadowCount = shadow != null ? shadow.count : 0;
        boolean matched = rawCount == shadowCount
                && equalsNullable(raw != null ? raw.minSequence : null, shadow != null ? shadow.minSequence : null)
                && equalsNullable(raw != null ? raw.maxSequence : null, shadow != null ? shadow.maxSequence : null);
        return new TableShadowCompareRow(
                symbol,
                marketType,
                rawCount,
                shadowCount,
                rawCount - shadowCount,
                raw != null ? raw.minSequence : null,
                raw != null ? raw.maxSequence : null,
                shadow != null ? shadow.minSequence : null,
                shadow != null ? shadow.maxSequence : null,
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
            Long minSequence,
            Long maxSequence
    ) {
    }
}
