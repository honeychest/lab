package com.chs.springboot.domain.binance.autotrade.strategy;

import com.chs.springboot.domain.binance.autotrade.model.AutoTradePositionMode;
import com.chs.springboot.domain.binance.autotrade.model.AutoTradeSide;

public interface PositionModeStrategy {

    AutoTradePositionMode mode();

    void validateEntry(AutoTradeSide currentSide, AutoTradeSide requestedSide);
}
