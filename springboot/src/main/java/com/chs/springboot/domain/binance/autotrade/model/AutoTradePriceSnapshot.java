package com.chs.springboot.domain.binance.autotrade.model;

import java.math.BigDecimal;

public record AutoTradePriceSnapshot(BigDecimal lastPrice, BigDecimal markPrice) {

    public AutoTradePriceSnapshot {
        if (lastPrice == null || lastPrice.signum() <= 0) {
            throw new IllegalArgumentException("마지막 체결 가격은 0보다 커야 합니다");
        }
        if (markPrice != null && markPrice.signum() <= 0) {
            throw new IllegalArgumentException("마크 가격은 0보다 커야 합니다");
        }
    }
}
