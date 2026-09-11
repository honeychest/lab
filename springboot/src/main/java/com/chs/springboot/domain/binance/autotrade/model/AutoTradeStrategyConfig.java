package com.chs.springboot.domain.binance.autotrade.model;

import java.math.BigDecimal;

public record AutoTradeStrategyConfig(
        String symbol,
        BigDecimal baseNotional,
        BigDecimal addStepPct,
        BigDecimal takeProfitPct,
        BigDecimal stopLossPct,
        BigDecimal martingaleRatio,
        int maxAdds,
        AutoTradePositionMode positionMode,
        AutoTradePriceSource priceSource
) {

    public AutoTradeStrategyConfig {
        if (symbol == null || symbol.isBlank()) {
            throw new IllegalArgumentException("심볼은 비어 있을 수 없습니다");
        }
        symbol = symbol.trim().toUpperCase();
        requirePositive(baseNotional, "최초 명목금액");
        requirePositive(addStepPct, "물타기 간격");
        requirePositive(takeProfitPct, "익절률");
        requirePositive(stopLossPct, "손절률");
        requireGreaterThanOne(martingaleRatio, "마틴게일 배율");
        if (maxAdds < 0) {
            throw new IllegalArgumentException("최대 추가 진입 횟수는 0 이상이어야 합니다");
        }
        positionMode = positionMode == null ? AutoTradePositionMode.ONE_WAY : positionMode;
        priceSource = priceSource == null ? AutoTradePriceSource.LAST_PRICE : priceSource;
    }

    public static AutoTradeStrategyConfig testDefaults() {
        return new AutoTradeStrategyConfig(
                "ENAUSDT",
                new BigDecimal("5"),
                new BigDecimal("0.01"),
                new BigDecimal("0.02"),
                new BigDecimal("0.02"),
                new BigDecimal("2"),
                3,
                AutoTradePositionMode.ONE_WAY,
                AutoTradePriceSource.LAST_PRICE
        );
    }

    private static void requirePositive(BigDecimal value, String name) {
        if (value == null || value.signum() <= 0) {
            throw new IllegalArgumentException(name + "는 0보다 커야 합니다");
        }
    }

    private static void requireGreaterThanOne(BigDecimal value, String name) {
        if (value == null || value.compareTo(BigDecimal.ONE) < 0) {
            throw new IllegalArgumentException(name + "는 1 이상이어야 합니다");
        }
    }
}
