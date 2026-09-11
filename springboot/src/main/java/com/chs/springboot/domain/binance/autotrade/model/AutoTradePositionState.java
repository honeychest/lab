package com.chs.springboot.domain.binance.autotrade.model;

import java.math.BigDecimal;

public record AutoTradePositionState(
        AutoTradeSide side,
        BigDecimal averageEntryPrice,
        BigDecimal positionNotional,
        int addCount
) {

    public AutoTradePositionState {
        side = side == null ? AutoTradeSide.NONE : side;
        averageEntryPrice = requirePositive(averageEntryPrice, "평균 진입가");
        positionNotional = requirePositive(positionNotional, "현재 포지션 명목금액");
        if (addCount < 0) {
            throw new IllegalArgumentException("추가 진입 횟수는 0 이상이어야 합니다");
        }
        if (side == AutoTradeSide.NONE) {
            throw new IllegalArgumentException("포지션 상태에는 방향이 필요합니다");
        }
    }

    private static BigDecimal requirePositive(BigDecimal value, String name) {
        if (value == null || value.signum() <= 0) {
            throw new IllegalArgumentException(name + "는 0보다 커야 합니다");
        }
        return value;
    }
}
