package com.chs.springboot.domain.binance.autotrade.service;

import com.chs.springboot.domain.binance.autotrade.model.AutoTradeFuturesOrder;
import com.chs.springboot.domain.binance.autotrade.model.AutoTradeFuturesPosition;
import com.chs.springboot.domain.binance.autotrade.model.AutoTradeSide;
import com.fasterxml.jackson.databind.JsonNode;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;

public final class AutoTradeFuturesResponseParser {

    private AutoTradeFuturesResponseParser() {
    }

    public static List<AutoTradeFuturesPosition> positions(JsonNode account) {
        List<AutoTradeFuturesPosition> positions = new ArrayList<>();
        for (JsonNode node : account.path("positions")) {
            BigDecimal quantity = decimal(node.path("positionAmt").asText("0"));
            if (quantity.signum() == 0) {
                continue;
            }
            positions.add(new AutoTradeFuturesPosition(
                    node.path("symbol").asText(),
                    side(quantity, node.path("positionSide").asText()),
                    quantity.abs(),
                    decimal(node.path("entryPrice").asText("0")),
                    decimal(node.path("unRealizedProfit").asText(node.path("unrealizedProfit").asText("0"))),
                    node.path("leverage").asInt(0),
                    node.path("isolated").asBoolean(false)
            ));
        }
        return List.copyOf(positions);
    }

    public static List<AutoTradeFuturesOrder> openOrders(JsonNode orders) {
        List<AutoTradeFuturesOrder> result = new ArrayList<>();
        for (JsonNode node : orders) {
            result.add(new AutoTradeFuturesOrder(
                    node.path("orderId").asLong(),
                    node.path("clientOrderId").asText(),
                    node.path("symbol").asText(),
                    node.path("side").asText(),
                    node.path("positionSide").asText(),
                    node.path("type").asText(),
                    node.path("status").asText(),
                    decimal(node.path("price").asText("0")),
                    decimal(node.path("stopPrice").asText("0")),
                    decimal(node.path("origQty").asText("0")),
                    decimal(node.path("executedQty").asText("0")),
                    node.path("reduceOnly").asBoolean(false),
                    node.path("closePosition").asBoolean(false)
            ));
        }
        return List.copyOf(result);
    }

    private static AutoTradeSide side(BigDecimal quantity, String positionSide) {
        if ("SHORT".equalsIgnoreCase(positionSide) || quantity.signum() < 0) {
            return AutoTradeSide.SHORT;
        }
        return AutoTradeSide.LONG;
    }

    private static BigDecimal decimal(String value) {
        return new BigDecimal(value == null || value.isBlank() ? "0" : value);
    }
}
