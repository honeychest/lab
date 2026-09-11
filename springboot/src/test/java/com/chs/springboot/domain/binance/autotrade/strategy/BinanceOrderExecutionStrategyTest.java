package com.chs.springboot.domain.binance.autotrade.strategy;

import com.chs.springboot.domain.binance.autotrade.model.AutoTradeActionKind;
import com.chs.springboot.domain.binance.autotrade.model.AutoTradeOrderPositionSide;
import com.chs.springboot.domain.binance.autotrade.model.AutoTradeOrderRequest;
import com.chs.springboot.domain.binance.autotrade.model.AutoTradeOrderSide;
import com.chs.springboot.domain.binance.autotrade.model.AutoTradeOrderSubmissionKind;
import com.chs.springboot.domain.binance.autotrade.model.AutoTradeOrderType;
import com.chs.springboot.domain.binance.autotrade.model.AutoTradeOrderTimeInForce;
import com.chs.springboot.domain.binance.autotrade.service.AutoTradeFuturesApiClient;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyMap;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class BinanceOrderExecutionStrategyTest {

    @Test
    void liveConditionalOrderUsesAlgoEndpointAndTriggerPrice() throws Exception {
        AutoTradeFuturesApiClient apiClient = mock(AutoTradeFuturesApiClient.class);
        when(apiClient.postSigned(eq("/fapi/v1/algoOrder"), anyMap()))
                .thenReturn(new ObjectMapper().readTree("{\"algoId\":12,\"clientAlgoId\":\"at_sl_1\"}"));
        BinanceLiveOrderExecutionStrategy strategy = new BinanceLiveOrderExecutionStrategy(apiClient);
        AutoTradeOrderRequest request = new AutoTradeOrderRequest(
                "ENAUSDT", AutoTradeActionKind.STOP_LOSS, AutoTradeOrderSide.SELL,
                AutoTradeOrderType.STOP_MARKET, AutoTradeOrderPositionSide.BOTH,
                new BigDecimal("10"), new BigDecimal("0.5"), true, "at_sl_1");

        assertThat(strategy.execute(request).kind()).isEqualTo(AutoTradeOrderSubmissionKind.LIVE_ACCEPTED);
        verify(apiClient).postSigned(eq("/fapi/v1/algoOrder"), org.mockito.ArgumentMatchers.argThat(
                parameters -> "CONDITIONAL".equals(parameters.get("algoType"))
                        && "0.5".equals(parameters.get("triggerPrice"))
                        && "at_sl_1".equals(parameters.get("clientAlgoId"))));
    }

    @Test
    void liveMarketOrderUsesRegularOrderEndpoint() throws Exception {
        AutoTradeFuturesApiClient apiClient = mock(AutoTradeFuturesApiClient.class);
        when(apiClient.postSigned(eq("/fapi/v1/order"), anyMap()))
                .thenReturn(new ObjectMapper().readTree("{\"orderId\":13,\"clientOrderId\":\"at_enter_1\"}"));
        BinanceLiveOrderExecutionStrategy strategy = new BinanceLiveOrderExecutionStrategy(apiClient);
        AutoTradeOrderRequest request = new AutoTradeOrderRequest(
                "ENAUSDT", AutoTradeActionKind.ENTER, AutoTradeOrderSide.BUY,
                AutoTradeOrderType.MARKET, AutoTradeOrderPositionSide.BOTH,
                new BigDecimal("10"), null, false, "at_enter_1");

        assertThat(strategy.execute(request).orderId()).isEqualTo(13L);
        verify(apiClient).postSigned(eq("/fapi/v1/order"), anyMap());
    }

    @Test
    void livePostOnlyLimitOrderSendsPriceAndGtxToRegularEndpoint() throws Exception {
        AutoTradeFuturesApiClient apiClient = mock(AutoTradeFuturesApiClient.class);
        when(apiClient.postSigned(eq("/fapi/v1/order"), anyMap()))
                .thenReturn(new ObjectMapper().readTree("{\"orderId\":14,\"clientOrderId\":\"at_enter_2\"}"));
        BinanceLiveOrderExecutionStrategy strategy = new BinanceLiveOrderExecutionStrategy(apiClient);
        AutoTradeOrderRequest request = new AutoTradeOrderRequest(
                "ENAUSDT", AutoTradeActionKind.ENTER, AutoTradeOrderSide.BUY,
                AutoTradeOrderType.LIMIT, AutoTradeOrderPositionSide.BOTH,
                new BigDecimal("10"), new BigDecimal("0.1685"), null,
                AutoTradeOrderTimeInForce.GTX, false, "at_enter_2");

        assertThat(strategy.execute(request).orderId()).isEqualTo(14L);
        verify(apiClient).postSigned(eq("/fapi/v1/order"), org.mockito.ArgumentMatchers.argThat(
                parameters -> "LIMIT".equals(parameters.get("type"))
                        && "0.1685".equals(parameters.get("price"))
                        && "GTX".equals(parameters.get("timeInForce"))));
    }
}
