package com.chs.springboot.domain.binance.autotrade.strategy;

import com.chs.springboot.domain.binance.autotrade.model.AutoTradePositionState;
import com.chs.springboot.domain.binance.autotrade.model.AutoTradeStrategyConfig;

import java.math.BigDecimal;

public final class MartingalePositionSizingStrategy implements PositionSizingStrategy {

    @Override
    public BigDecimal initialNotional(AutoTradeStrategyConfig config) {
        return config.baseNotional();
    }

    @Override
    public BigDecimal nextAddNotional(AutoTradePositionState position, AutoTradeStrategyConfig config) {
        return config.baseNotional().multiply(config.martingaleRatio().pow(position.addCount()));
    }
}
