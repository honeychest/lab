package com.chs.springboot.domain.binance.autotrade.strategy;

import com.chs.springboot.domain.binance.autotrade.model.AutoTradePriceSnapshot;
import com.chs.springboot.domain.binance.autotrade.model.AutoTradePriceSource;

import java.math.BigDecimal;

public final class LastPriceStrategy implements PriceSourceStrategy {

    @Override
    public AutoTradePriceSource source() {
        return AutoTradePriceSource.LAST_PRICE;
    }

    @Override
    public BigDecimal currentPrice(AutoTradePriceSnapshot snapshot) {
        return snapshot.lastPrice();
    }
}
