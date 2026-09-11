package com.chs.springboot.domain.binance.autotrade.strategy;

import com.chs.springboot.domain.binance.autotrade.model.AutoTradePositionState;
import com.chs.springboot.domain.binance.autotrade.model.AutoTradeStrategyConfig;

import java.math.BigDecimal;

public interface PositionSizingStrategy {

    BigDecimal initialNotional(AutoTradeStrategyConfig config);

    BigDecimal nextAddNotional(AutoTradePositionState position, AutoTradeStrategyConfig config);
}
