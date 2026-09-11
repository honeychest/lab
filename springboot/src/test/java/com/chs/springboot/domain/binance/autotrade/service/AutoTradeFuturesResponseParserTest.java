package com.chs.springboot.domain.binance.autotrade.service;

import com.chs.springboot.domain.binance.autotrade.model.AutoTradeFuturesOrder;
import com.chs.springboot.domain.binance.autotrade.model.AutoTradeFuturesPosition;
import com.chs.springboot.domain.binance.autotrade.model.AutoTradeSide;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class AutoTradeFuturesResponseParserTest {

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Test
    void parsesOneWayLongPositionAndOpenOrder() throws Exception {
        JsonNode account = objectMapper.readTree("""
                {
                  "positions": [
                    {"symbol":"ENAUSDT","positionAmt":"29","entryPrice":"0.17",
                     "unRealizedProfit":"0.10","leverage":"1","isolated":true,"positionSide":"BOTH"},
                    {"symbol":"BTCUSDT","positionAmt":"0","entryPrice":"0"}
                  ]
                }
                """);
        JsonNode orders = objectMapper.readTree("""
                [{"orderId":1,"clientOrderId":"auto-add-1","symbol":"ENAUSDT","side":"BUY",
                  "positionSide":"BOTH","type":"LIMIT","status":"NEW","price":"0.16",
                  "stopPrice":"0","origQty":"30","executedQty":"0","reduceOnly":false,
                  "closePosition":false}]
                """);

        List<AutoTradeFuturesPosition> positions = AutoTradeFuturesResponseParser.positions(account);
        List<AutoTradeFuturesOrder> openOrders = AutoTradeFuturesResponseParser.openOrders(orders);

        assertThat(positions).hasSize(1);
        assertThat(positions.get(0).side()).isEqualTo(AutoTradeSide.LONG);
        assertThat(positions.get(0).quantity()).isEqualByComparingTo("29");
        assertThat(openOrders).hasSize(1);
        assertThat(openOrders.get(0).clientOrderId()).isEqualTo("auto-add-1");
    }

    @Test
    void parsesNegativeOneWayQuantityAsShort() throws Exception {
        JsonNode account = objectMapper.readTree("""
                {"positions":[{"symbol":"ENAUSDT","positionAmt":"-29","entryPrice":"0.17","positionSide":"BOTH"}]}
                """);

        List<AutoTradeFuturesPosition> positions = AutoTradeFuturesResponseParser.positions(account);

        assertThat(positions).singleElement().satisfies(position -> {
            assertThat(position.side()).isEqualTo(AutoTradeSide.SHORT);
            assertThat(position.quantity()).isEqualByComparingTo("29");
        });
    }
}
