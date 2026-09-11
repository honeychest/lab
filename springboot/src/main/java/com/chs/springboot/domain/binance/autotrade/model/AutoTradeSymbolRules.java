package com.chs.springboot.domain.binance.autotrade.model;

import java.math.BigDecimal;

public record AutoTradeSymbolRules(
        String symbol,
        BigDecimal quantityStep,
        BigDecimal minimumQuantity,
        BigDecimal minimumNotional,
        BigDecimal priceTick
) {

    public AutoTradeSymbolRules {
        if (symbol == null || symbol.isBlank()) {
            throw new IllegalArgumentException("심볼은 비어 있을 수 없습니다");
        }
        requirePositive(quantityStep, "수량 단위");
        requirePositive(minimumQuantity, "최소 수량");
        requireNonNegative(minimumNotional, "최소 명목금액");
        requirePositive(priceTick, "가격 단위");
    }

    private static void requirePositive(BigDecimal value, String name) {
        if (value == null || value.signum() <= 0) {
            throw new IllegalArgumentException(name + "은 0보다 커야 합니다");
        }
    }

    private static void requireNonNegative(BigDecimal value, String name) {
        if (value == null || value.signum() < 0) {
            throw new IllegalArgumentException(name + "은 0 이상이어야 합니다");
        }
    }
}
