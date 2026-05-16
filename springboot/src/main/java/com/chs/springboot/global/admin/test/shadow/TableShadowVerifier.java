package com.chs.springboot.global.admin.test.shadow;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Service
public class TableShadowVerifier {

    private final JdbcTemplate jdbcTemplate;

    public TableShadowVerifier(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public TableShadowCompareResponse compareRecent(TableShadowProfile profile, int minutes) {
        return compareRecent(profile, minutes, 20);
    }

    public TableShadowCompareResponse compareRecent(TableShadowProfile profile, int minutes, int graceSeconds) {
        int safeMinutes = Math.max(1, Math.min(minutes, 24 * 60));
        int safeGraceSeconds = Math.max(0, Math.min(graceSeconds, 5 * 60));
        long now = System.currentTimeMillis();
        long sinceMs = now - safeMinutes * 60_000L;
        long untilMs = now - safeGraceSeconds * 1_000L;
        Map<String, TableStats> rawStats = loadStats(profile, profile.rawTable(), sinceMs, untilMs);
        Map<String, TableStats> shadowStats = loadStats(profile, profile.shadowTable(), sinceMs, untilMs);
        Map<String, TableShadowCompareRow> rows = new LinkedHashMap<>();

        rawStats.forEach((key, raw) -> rows.put(key, toRow(raw, shadowStats.get(key))));
        shadowStats.forEach((key, shadow) -> rows.putIfAbsent(key, toRow(rawStats.get(key), shadow)));

        return new TableShadowCompareResponse(profile.id(), safeMinutes, safeGraceSeconds, List.copyOf(rows.values()));
    }

    public TableShadowMultiCompareResponse compareRecentWindows(TableShadowProfile profile, List<Integer> minutesList) {
        return compareRecentWindows(profile, minutesList, 20);
    }

    public TableShadowMultiCompareResponse compareRecentWindows(TableShadowProfile profile, List<Integer> minutesList, int graceSeconds) {
        int safeGraceSeconds = Math.max(0, Math.min(graceSeconds, 5 * 60));
        List<TableShadowWindowSummary> windows = minutesList.stream()
                .distinct()
                .map(minutes -> compareRecent(profile, minutes, safeGraceSeconds))
                .map(response -> new TableShadowWindowSummary(
                        response.minutes(),
                        response.graceSeconds(),
                        response.rows().size(),
                        (int) response.rows().stream().filter(row -> !"OK".equals(row.status())).count(),
                        response.rows().stream().mapToLong(TableShadowCompareRow::countDelta).sum()
                ))
                .collect(Collectors.toList());
        return new TableShadowMultiCompareResponse(profile.id(), windows);
    }

    private Map<String, TableStats> loadStats(TableShadowProfile profile, String tableName, long sinceMs, long untilMs) {
        String sql = """
                SELECT %s AS symbol,
                       %s AS market_type,
                       COUNT(*) AS row_count,
                       MIN(%s) AS min_sequence,
                       MAX(%s) AS max_sequence
                FROM %s
                WHERE %s >= ?
                  AND %s < ?
                GROUP BY %s, %s
                ORDER BY %s, %s
                """.formatted(
                profile.symbolColumn(),
                profile.marketTypeColumn(),
                profile.sequenceColumn(),
                profile.sequenceColumn(),
                tableName,
                profile.timeColumn(),
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
        }, sinceMs, untilMs);
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
