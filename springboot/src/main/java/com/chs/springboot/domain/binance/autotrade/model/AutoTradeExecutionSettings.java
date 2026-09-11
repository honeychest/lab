package com.chs.springboot.domain.binance.autotrade.model;

public record AutoTradeExecutionSettings(
        AutoTradeExecutionMode mode,
        AutoTradeExecutionPolicy policy,
        long pollIntervalMs,
        long accountRefreshIntervalMs,
        long entryAnalysisIntervalMs,
        long orderCooldownMs
) {

    public AutoTradeExecutionSettings {
        mode = mode == null ? AutoTradeExecutionMode.OFF : mode;
        policy = policy == null ? AutoTradeExecutionPolicy.MANUAL : policy;
        requireAtLeast(pollIntervalMs, 100, "실행 점검 간격");
        requireAtLeast(accountRefreshIntervalMs, 250, "계정 상태 갱신 간격");
        requireAtLeast(entryAnalysisIntervalMs, 1_000, "진입 분석 간격");
        requireAtLeast(orderCooldownMs, 0, "주문 재시도 대기 간격");
    }

    public AutoTradeExecutionSettings(AutoTradeExecutionMode mode,
                                      long pollIntervalMs,
                                      long accountRefreshIntervalMs,
                                      long entryAnalysisIntervalMs,
                                      long orderCooldownMs) {
        this(mode, AutoTradeExecutionPolicy.MANUAL, pollIntervalMs,
                accountRefreshIntervalMs, entryAnalysisIntervalMs, orderCooldownMs);
    }

    private static void requireAtLeast(long value, long minimum, String name) {
        if (value < minimum) {
            throw new IllegalArgumentException(name + "은 " + minimum + " 이상이어야 합니다");
        }
    }
}
