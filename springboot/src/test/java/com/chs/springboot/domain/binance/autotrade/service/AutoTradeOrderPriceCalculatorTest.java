package com.chs.springboot.domain.binance.autotrade.service;

import com.chs.springboot.domain.binance.autotrade.model.AutoTradeSide;
import com.chs.springboot.domain.binance.autotrade.model.AutoTradeBookTicker;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;

import static org.assertj.core.api.Assertions.assertThat;

class AutoTradeOrderPriceCalculatorTest {

    @Test
    void alignsLongProtectionPricesToTheSaferTickDirection() {
        assertThat(AutoTradeOrderPriceCalculator.takeProfit(
                AutoTradeSide.LONG, new BigDecimal("100"), new BigDecimal("0.02"), new BigDecimal("0.3")))
                .isEqualByComparingTo(new BigDecimal("102"));
        assertThat(AutoTradeOrderPriceCalculator.stopLoss(
                AutoTradeSide.LONG, new BigDecimal("100"), new BigDecimal("0.02"), new BigDecimal("0.3")))
                .isEqualByComparingTo(new BigDecimal("98.1"));
    }

    @Test
    void invertsProtectionDirectionsForShort() {
        assertThat(AutoTradeOrderPriceCalculator.takeProfit(
                AutoTradeSide.SHORT, new BigDecimal("100"), new BigDecimal("0.02"), new BigDecimal("0.3")))
                .isEqualByComparingTo(new BigDecimal("98.1"));
        assertThat(AutoTradeOrderPriceCalculator.stopLoss(
                AutoTradeSide.SHORT, new BigDecimal("100"), new BigDecimal("0.02"), new BigDecimal("0.3")))
                .isEqualByComparingTo(new BigDecimal("102"));
    }

    @Test
    void choosesThePassiveTickFromTheBestBidAndAsk() {
        AutoTradeBookTicker ticker = new AutoTradeBookTicker(
                "ENAUSDT", new BigDecimal("100"), new BigDecimal("101"), 1700000000000L);

        assertThat(AutoTradeOrderPriceCalculator.makerEntryPrice(
                AutoTradeSide.LONG, ticker, new BigDecimal("0.5")))
                .isEqualByComparingTo(new BigDecimal("100"));
        assertThat(AutoTradeOrderPriceCalculator.makerEntryPrice(
                AutoTradeSide.SHORT, ticker, new BigDecimal("0.5")))
                .isEqualByComparingTo(new BigDecimal("101"));
    }
}
