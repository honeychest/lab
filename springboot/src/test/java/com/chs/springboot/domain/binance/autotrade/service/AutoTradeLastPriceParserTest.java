package com.chs.springboot.domain.binance.autotrade.service;

import com.chs.springboot.domain.binance.autotrade.model.AutoTradePriceTick;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class AutoTradeLastPriceParserTest {

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Test
    void parsesFuturesTradePriceInMemory() {
        AutoTradePriceTick tick = AutoTradeLastPriceParser.parse(
                "{\"e\":\"trade\",\"p\":\"0.1696700\",\"T\":1700000000000}", objectMapper);

        assertThat(tick.price()).isEqualByComparingTo("0.1696700");
        assertThat(tick.tradedAtMs()).isEqualTo(1700000000000L);
    }

    @Test
    void rejectsNonTradeEvents() {
        assertThatThrownBy(() -> AutoTradeLastPriceParser.parse(
                "{\"e\":\"kline\"}", objectMapper))
                .isInstanceOf(IllegalArgumentException.class);
    }
}
