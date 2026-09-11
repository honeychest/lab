package com.chs.springboot.domain.binance.autotrade.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class AutoTradeSymbolCatalogParserTest {

    @Test
    void returnsOnlyTradingUsdtSymbols() throws Exception {
        List<String> symbols = AutoTradeSymbolCatalogParser.parse(new ObjectMapper().readTree("""
                {
                  "symbols": [
                    {"symbol":"ENAUSDT","status":"TRADING","quoteAsset":"USDT"},
                    {"symbol":"BTCUSDT","status":"TRADING","quoteAsset":"USDT"},
                    {"symbol":"OLDUSDT","status":"BREAK","quoteAsset":"USDT"},
                    {"symbol":"ETHUSDC","status":"TRADING","quoteAsset":"USDC"}
                  ]
                }
                """));

        assertThat(symbols).containsExactly("BTCUSDT", "ENAUSDT");
    }
}
