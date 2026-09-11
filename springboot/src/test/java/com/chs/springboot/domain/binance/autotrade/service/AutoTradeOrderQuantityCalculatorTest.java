package com.chs.springboot.domain.binance.autotrade.service;

import com.chs.springboot.domain.binance.autotrade.model.AutoTradeSymbolRules;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class AutoTradeOrderQuantityCalculatorTest {

    private final AutoTradeSymbolRules rules = new AutoTradeSymbolRules(
            "ENAUSDT",
            new BigDecimal("2"),
            new BigDecimal("2"),
            new BigDecimal("5"),
            new BigDecimal("0.0001")
    );

    @Test
    void roundsQuantityDownToTheMarketStep() {
        BigDecimal quantity = AutoTradeOrderQuantityCalculator.fromNotional(
                new BigDecimal("10"), new BigDecimal("1.01"), rules);

        assertThat(quantity).isEqualByComparingTo(new BigDecimal("8"));
        assertThat(quantity.multiply(new BigDecimal("1.01"))).isGreaterThanOrEqualTo(new BigDecimal("5"));
    }

    @Test
    void rejectsWhenRoundedQuantityFallsBelowMinimumNotional() {
        AutoTradeSymbolRules highMinimumNotional = new AutoTradeSymbolRules(
                "ENAUSDT", new BigDecimal("1"), new BigDecimal("1"),
                new BigDecimal("7"), new BigDecimal("0.0001"));
        assertThatThrownBy(() -> AutoTradeOrderQuantityCalculator.fromNotional(
                new BigDecimal("5"), new BigDecimal("3"), highMinimumNotional))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("최소 명목금액");
    }

    @Test
    void roundsOneStepUpWhenTheRequestedNotionalWouldMissMinimumNotional() {
        AutoTradeSymbolRules fineStepRules = new AutoTradeSymbolRules(
                "ENAUSDT", new BigDecimal("0.001"), new BigDecimal("0.001"),
                new BigDecimal("5"), new BigDecimal("0.0001"));
        BigDecimal quantity = AutoTradeOrderQuantityCalculator.fromNotional(
                new BigDecimal("5"), new BigDecimal("99"), fineStepRules);

        assertThat(quantity).isEqualByComparingTo(new BigDecimal("0.051"));
        assertThat(quantity.multiply(new BigDecimal("99"))).isGreaterThanOrEqualTo(new BigDecimal("5"));
    }
}
