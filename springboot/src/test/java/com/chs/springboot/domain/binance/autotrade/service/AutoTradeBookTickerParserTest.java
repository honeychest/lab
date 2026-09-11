package com.chs.springboot.domain.binance.autotrade.service;

import com.chs.springboot.domain.binance.autotrade.model.AutoTradeBookTicker;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;

import static org.assertj.core.api.Assertions.assertThat;

class AutoTradeBookTickerParserTest {

    @Test
    void parsesBestBidAndAskFromFuturesBookTicker() {
        AutoTradeBookTicker ticker = AutoTradeBookTickerParser.parse(
                "{\"e\":\"bookTicker\",\"E\":1700000000000,\"s\":\"ENAUSDT\",\"b\":\"0.1685\",\"B\":\"100\",\"a\":\"0.1686\",\"A\":\"200\"}",
                new ObjectMapper());

        assertThat(ticker.symbol()).isEqualTo("ENAUSDT");
        assertThat(ticker.bestBid()).isEqualByComparingTo(new BigDecimal("0.1685"));
        assertThat(ticker.bestAsk()).isEqualByComparingTo(new BigDecimal("0.1686"));
    }
}
