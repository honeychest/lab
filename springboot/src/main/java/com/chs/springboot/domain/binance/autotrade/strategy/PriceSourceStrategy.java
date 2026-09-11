package com.chs.springboot.domain.binance.autotrade.strategy;

import com.chs.springboot.domain.binance.autotrade.model.AutoTradePriceSnapshot;
import com.chs.springboot.domain.binance.autotrade.model.AutoTradePriceSource;

import java.math.BigDecimal;

public interface PriceSourceStrategy {

    AutoTradePriceSource source();

    BigDecimal currentPrice(AutoTradePriceSnapshot snapshot);
}
