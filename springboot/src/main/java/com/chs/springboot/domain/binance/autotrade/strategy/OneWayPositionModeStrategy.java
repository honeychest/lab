package com.chs.springboot.domain.binance.autotrade.strategy;

import com.chs.springboot.domain.binance.autotrade.model.AutoTradePositionMode;
import com.chs.springboot.domain.binance.autotrade.model.AutoTradeSide;

public final class OneWayPositionModeStrategy implements PositionModeStrategy {

    @Override
    public AutoTradePositionMode mode() {
        return AutoTradePositionMode.ONE_WAY;
    }

    @Override
    public void validateEntry(AutoTradeSide currentSide, AutoTradeSide requestedSide) {
        if (requestedSide == null || requestedSide == AutoTradeSide.NONE) {
            throw new IllegalArgumentException("진입 방향이 필요합니다");
        }
        if (currentSide != null && currentSide != AutoTradeSide.NONE && currentSide != requestedSide) {
            throw new IllegalStateException("One-way mode에서는 반대 방향 포지션을 동시에 열 수 없습니다");
        }
    }
}
