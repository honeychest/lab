package com.chs.springboot.domain.binance.autotrade.service;

import com.chs.springboot.domain.binance.autotrade.model.AutoTradeFuturesAlgoOrder;
import com.fasterxml.jackson.databind.JsonNode;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;

public final class AutoTradeFuturesAlgoResponseParser {

    private AutoTradeFuturesAlgoResponseParser() {
    }

    public static List<AutoTradeFuturesAlgoOrder> openOrders(JsonNode response) {
        List<AutoTradeFuturesAlgoOrder> result = new ArrayList<>();
        if (response.isObject()) {
            add(result, response);
        } else {
            for (JsonNode node : response) {
                add(result, node);
            }
        }
        return List.copyOf(result);
    }

    private static void add(List<AutoTradeFuturesAlgoOrder> result, JsonNode node) {
        result.add(new AutoTradeFuturesAlgoOrder(
                node.path("algoId").asLong(),
                node.path("clientAlgoId").asText(),
                node.path("symbol").asText(),
                node.path("side").asText(),
                node.path("positionSide").asText("BOTH"),
                node.path("orderType").asText(node.path("type").asText()),
                node.path("algoStatus").asText(node.path("status").asText()),
                decimal(node, "quantity", "origQty"),
                decimal(node, "price", "orderPrice"),
                decimal(node, "triggerPrice", "stopPrice"),
                node.path("reduceOnly").asBoolean(false),
                node.path("closePosition").asBoolean(false)
        ));
    }

    private static BigDecimal decimal(JsonNode node, String primary, String fallback) {
        String value = node.path(primary).asText(node.path(fallback).asText("0"));
        return new BigDecimal(value == null || value.isBlank() ? "0" : value);
    }
}
