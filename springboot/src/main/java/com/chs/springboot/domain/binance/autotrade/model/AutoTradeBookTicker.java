package com.chs.springboot.domain.binance.autotrade.model;

import java.math.BigDecimal;

public record AutoTradeBookTicker(
        String symbol,
        BigDecimal bestBid,
        BigDecimal bestAsk,
        long eventTimeMs
) {

    public AutoTradeBookTicker {
        if (symbol == null || symbol.isBlank()) {
            throw new IllegalArgumentException("호가 심볼은 비어 있을 수 없습니다");
        }
        symbol = symbol.trim().toUpperCase();
        if (bestBid == null || bestBid.signum() <= 0) {
            throw new IllegalArgumentException("최우선 매수호가는 0보다 커야 합니다");
        }
        if (bestAsk == null || bestAsk.signum() <= 0) {
            throw new IllegalArgumentException("최우선 매도호가는 0보다 커야 합니다");
        }
        if (bestBid.compareTo(bestAsk) > 0) {
            throw new IllegalArgumentException("최우선 매수호가는 매도호가보다 클 수 없습니다");
        }
        if (eventTimeMs <= 0) {
            throw new IllegalArgumentException("호가 시각은 0보다 커야 합니다");
        }
    }
}
