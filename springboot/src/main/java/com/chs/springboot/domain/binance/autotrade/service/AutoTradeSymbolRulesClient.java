package com.chs.springboot.domain.binance.autotrade.service;

import com.chs.springboot.domain.binance.autotrade.model.AutoTradeSymbolRules;
import com.fasterxml.jackson.databind.JsonNode;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Component
@RequiredArgsConstructor
public class AutoTradeSymbolRulesClient {

    private final AutoTradeFuturesApiClient apiClient;
    private final ConcurrentHashMap<String, AutoTradeSymbolRules> cache = new ConcurrentHashMap<>();

    public AutoTradeSymbolRules rules(String symbol) {
        String normalized = symbol.trim().toUpperCase();
        return cache.computeIfAbsent(normalized, this::fetch);
    }

    public void refresh(String symbol) {
        String normalized = symbol.trim().toUpperCase();
        cache.put(normalized, fetch(normalized));
    }

    private AutoTradeSymbolRules fetch(String symbol) {
        JsonNode exchangeInfo = apiClient.getPublic("/fapi/v1/exchangeInfo", Map.of("symbol", symbol));
        return AutoTradeSymbolRulesParser.parse(exchangeInfo, symbol);
    }
}
