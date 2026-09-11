package com.chs.springboot.domain.binance.autotrade.service;

import com.chs.springboot.domain.binance.autotrade.model.AutoTradeSymbolRules;

import java.math.BigDecimal;
import java.math.RoundingMode;

public final class AutoTradeOrderQuantityCalculator {

    private AutoTradeOrderQuantityCalculator() {
    }

    public static BigDecimal fromNotional(BigDecimal notional,
                                          BigDecimal price,
                                          AutoTradeSymbolRules rules) {
        if (notional == null || notional.signum() <= 0) {
            throw new IllegalArgumentException("주문 명목금액은 0보다 커야 합니다");
        }
        if (price == null || price.signum() <= 0) {
            throw new IllegalArgumentException("주문 기준 가격은 0보다 커야 합니다");
        }
        BigDecimal rawQuantity = notional.divide(price, 18, RoundingMode.DOWN);
        BigDecimal units = rawQuantity.divide(rules.quantityStep(), 0, RoundingMode.DOWN);
        BigDecimal quantity = units.multiply(rules.quantityStep()).stripTrailingZeros();
        if (quantity.multiply(price).compareTo(rules.minimumNotional()) < 0
                && rules.minimumNotional().signum() > 0) {
            units = units.add(BigDecimal.ONE);
            quantity = units.multiply(rules.quantityStep()).stripTrailingZeros();
        }
        if (quantity.compareTo(rules.minimumQuantity()) < 0) {
            throw new IllegalArgumentException("주문 수량이 심볼 최소 수량보다 작습니다");
        }
        if (quantity.multiply(price).compareTo(rules.minimumNotional()) < 0) {
            throw new IllegalArgumentException("주문 명목금액이 심볼 최소 명목금액보다 작습니다");
        }
        return quantity;
    }
}
