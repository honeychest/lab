package com.chs.springboot.domain.binance.autotrade.model;

import java.math.BigDecimal;

public record AutoTradePriceTick(BigDecimal price, long tradedAtMs) {

    public AutoTradePriceTick {
        if (price == null || price.signum() <= 0) {
            throw new IllegalArgumentException("체결 가격은 0보다 커야 합니다");
        }
        if (tradedAtMs <= 0) {
            throw new IllegalArgumentException("체결 시각은 0보다 커야 합니다");
        }
    }
}
