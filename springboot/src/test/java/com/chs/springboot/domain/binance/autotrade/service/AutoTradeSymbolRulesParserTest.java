package com.chs.springboot.domain.binance.autotrade.service;

import com.chs.springboot.domain.binance.autotrade.model.AutoTradeSymbolRules;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;

import static org.assertj.core.api.Assertions.assertThat;

class AutoTradeSymbolRulesParserTest {

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Test
    void readsMarketQuantityAndNotionalRules() throws Exception {
        AutoTradeSymbolRules rules = AutoTradeSymbolRulesParser.parse(objectMapper.readTree("""
                {
                  "symbols": [{
                    "symbol": "ENAUSDT",
                    "filters": [
                      {"filterType":"PRICE_FILTER","tickSize":"0.0001"},
                      {"filterType":"LOT_SIZE","minQty":"1","stepSize":"1"},
                      {"filterType":"MARKET_LOT_SIZE","minQty":"2","stepSize":"2"},
                      {"filterType":"MIN_NOTIONAL","notional":"5"}
                    ]
                  }]
                }
                """), "ENAUSDT");

        assertThat(rules.symbol()).isEqualTo("ENAUSDT");
        assertThat(rules.quantityStep()).isEqualByComparingTo(new BigDecimal("2"));
        assertThat(rules.minimumQuantity()).isEqualByComparingTo(new BigDecimal("2"));
        assertThat(rules.minimumNotional()).isEqualByComparingTo(new BigDecimal("5"));
        assertThat(rules.priceTick()).isEqualByComparingTo(new BigDecimal("0.0001"));
    }
}
