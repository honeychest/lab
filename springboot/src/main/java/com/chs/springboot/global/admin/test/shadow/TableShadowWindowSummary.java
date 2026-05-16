package com.chs.springboot.global.admin.test.shadow;

public record TableShadowWindowSummary(
        int minutes,
        int graceSeconds,
        int totalRows,
        int checkRows,
        long totalDelta
) {
}
