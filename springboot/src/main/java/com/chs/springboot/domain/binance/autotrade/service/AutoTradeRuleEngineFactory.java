package com.chs.springboot.domain.binance.autotrade.service;

import com.chs.springboot.domain.binance.autotrade.model.AutoTradePositionMode;
import com.chs.springboot.domain.binance.autotrade.model.AutoTradePriceSource;
import com.chs.springboot.domain.binance.autotrade.model.AutoTradeStrategyConfig;
import com.chs.springboot.domain.binance.autotrade.strategy.LastPriceStrategy;
import com.chs.springboot.domain.binance.autotrade.strategy.MartingalePositionSizingStrategy;
import com.chs.springboot.domain.binance.autotrade.strategy.OneWayPositionModeStrategy;
import com.chs.springboot.domain.binance.autotrade.strategy.PositionModeStrategy;
import com.chs.springboot.domain.binance.autotrade.strategy.PositionSizingStrategy;
import com.chs.springboot.domain.binance.autotrade.strategy.PriceSourceStrategy;
import org.springframework.stereotype.Component;

import java.util.Map;

@Component
public class AutoTradeRuleEngineFactory {

    private final Map<AutoTradePositionMode, PositionModeStrategy> positionModes = Map.of(
            AutoTradePositionMode.ONE_WAY, new OneWayPositionModeStrategy()
    );
    private final Map<AutoTradePriceSource, PriceSourceStrategy> priceSources = Map.of(
            AutoTradePriceSource.LAST_PRICE, new LastPriceStrategy()
    );
    private final PositionSizingStrategy positionSizing = new MartingalePositionSizingStrategy();

    public AutoTradeRuleEngine create(AutoTradeStrategyConfig config) {
        PositionModeStrategy positionMode = positionModes.get(config.positionMode());
        PriceSourceStrategy priceSource = priceSources.get(config.priceSource());
        if (positionMode == null || priceSource == null) {
            throw new IllegalStateException("지원하지 않는 자동매매 전략 설정입니다");
        }
        return new AutoTradeRuleEngine(positionMode, positionSizing, priceSource);
    }
}
