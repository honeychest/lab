package com.chs.springboot.domain.binance.autotrade.service;

import com.chs.springboot.domain.binance.autotrade.model.AutoTradeSymbolRules;
import com.fasterxml.jackson.databind.JsonNode;

import java.math.BigDecimal;

public final class AutoTradeSymbolRulesParser {

    private AutoTradeSymbolRulesParser() {
    }

    public static AutoTradeSymbolRules parse(JsonNode exchangeInfo, String symbol) {
        for (JsonNode node : exchangeInfo.path("symbols")) {
            if (symbol.equalsIgnoreCase(node.path("symbol").asText())) {
                return new AutoTradeSymbolRules(
                        node.path("symbol").asText(symbol).toUpperCase(),
                        quantityStep(node),
                        minimumQuantity(node),
                        minimumNotional(node),
                        filterValue(node, "PRICE_FILTER", "tickSize", "0.00000001")
                );
            }
        }
        throw new IllegalArgumentException("Binance 선물 심볼 규칙을 찾을 수 없습니다: " + symbol);
    }

    private static BigDecimal quantityStep(JsonNode symbol) {
        JsonNode marketLot = filter(symbol, "MARKET_LOT_SIZE");
        if (marketLot != null && decimal(marketLot, "stepSize").signum() > 0) {
            return decimal(marketLot, "stepSize");
        }
        return filterValue(symbol, "LOT_SIZE", "stepSize", "1");
    }

    private static BigDecimal minimumQuantity(JsonNode symbol) {
        JsonNode marketLot = filter(symbol, "MARKET_LOT_SIZE");
        if (marketLot != null && decimal(marketLot, "minQty").signum() > 0) {
            return decimal(marketLot, "minQty");
        }
        return filterValue(symbol, "LOT_SIZE", "minQty", "0");
    }

    private static BigDecimal minimumNotional(JsonNode symbol) {
        JsonNode notional = filter(symbol, "NOTIONAL");
        if (notional != null) {
            return decimal(notional, "minNotional");
        }
        JsonNode minimumNotional = filter(symbol, "MIN_NOTIONAL");
        return minimumNotional == null ? BigDecimal.ZERO : decimal(minimumNotional, "notional");
    }

    private static BigDecimal filterValue(JsonNode symbol,
                                          String filterType,
                                          String field,
                                          String fallback) {
        JsonNode filter = filter(symbol, filterType);
        return filter == null ? new BigDecimal(fallback) : decimal(filter, field);
    }

    private static JsonNode filter(JsonNode symbol, String filterType) {
        for (JsonNode node : symbol.path("filters")) {
            if (filterType.equals(node.path("filterType").asText())) {
                return node;
            }
        }
        return null;
    }

    private static BigDecimal decimal(JsonNode node, String field) {
        String value = node.path(field).asText("0");
        return new BigDecimal(value.isBlank() ? "0" : value);
    }
}
