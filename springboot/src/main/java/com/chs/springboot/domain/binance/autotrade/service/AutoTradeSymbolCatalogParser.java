package com.chs.springboot.domain.binance.autotrade.service;

import com.fasterxml.jackson.databind.JsonNode;

import java.util.Comparator;
import java.util.List;
import java.util.stream.StreamSupport;

public final class AutoTradeSymbolCatalogParser {

    private AutoTradeSymbolCatalogParser() {
    }

    public static List<String> parse(JsonNode exchangeInfo) {
        return StreamSupport.stream(exchangeInfo.path("symbols").spliterator(), false)
                .filter(node -> "TRADING".equalsIgnoreCase(node.path("status").asText()))
                .filter(node -> "USDT".equalsIgnoreCase(node.path("quoteAsset").asText()))
                .map(node -> node.path("symbol").asText())
                .filter(symbol -> !symbol.isBlank())
                .map(String::toUpperCase)
                .distinct()
                .sorted(Comparator.naturalOrder())
                .toList();
    }
}
