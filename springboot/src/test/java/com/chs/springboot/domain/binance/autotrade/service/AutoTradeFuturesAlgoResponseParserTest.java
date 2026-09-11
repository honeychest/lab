package com.chs.springboot.domain.binance.autotrade.service;

import com.chs.springboot.domain.binance.autotrade.model.AutoTradeFuturesAlgoOrder;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class AutoTradeFuturesAlgoResponseParserTest {

    @Test
    void parsesConditionalOrderFields() throws Exception {
        List<AutoTradeFuturesAlgoOrder> orders = AutoTradeFuturesAlgoResponseParser.openOrders(
                new ObjectMapper().readTree("""
                        [{
                          "algoId": 11,
                          "clientAlgoId": "at_tp_1",
                          "symbol": "ENAUSDT",
                          "side": "SELL",
                          "positionSide": "BOTH",
                          "orderType": "TAKE_PROFIT_MARKET",
                          "algoStatus": "NEW",
                          "quantity": "10",
                          "triggerPrice": "0.5",
                          "reduceOnly": true,
                          "closePosition": false
                        }]
                        """));

        assertThat(orders).hasSize(1);
        assertThat(orders.get(0).algoId()).isEqualTo(11);
        assertThat(orders.get(0).quantity()).isEqualByComparingTo(new BigDecimal("10"));
        assertThat(orders.get(0).triggerPrice()).isEqualByComparingTo(new BigDecimal("0.5"));
    }
}
