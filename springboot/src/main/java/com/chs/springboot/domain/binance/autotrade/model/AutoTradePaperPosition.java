package com.chs.springboot.domain.binance.autotrade.model;

import java.math.BigDecimal;

public record AutoTradePaperPosition(
        AutoTradeSide side,
        BigDecimal quantity,
        BigDecimal averageEntryPrice,
        int addCount
) {

    public AutoTradePaperPosition {
        if (side == null || side == AutoTradeSide.NONE) {
            throw new IllegalArgumentException("PAPER 포지션 방향이 필요합니다");
        }
        if (quantity == null || quantity.signum() <= 0) {
            throw new IllegalArgumentException("PAPER 포지션 수량은 0보다 커야 합니다");
        }
        if (averageEntryPrice == null || averageEntryPrice.signum() <= 0) {
            throw new IllegalArgumentException("PAPER 평균 진입가는 0보다 커야 합니다");
        }
        if (addCount < 0) {
            throw new IllegalArgumentException("PAPER 추가 진입 횟수는 0 이상이어야 합니다");
        }
    }
}
