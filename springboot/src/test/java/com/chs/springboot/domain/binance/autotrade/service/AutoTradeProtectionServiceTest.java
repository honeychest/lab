package com.chs.springboot.domain.binance.autotrade.service;

import com.chs.springboot.domain.binance.autotrade.model.AutoTradeActionKind;
import com.chs.springboot.domain.binance.autotrade.model.AutoTradeExecutionMode;
import com.chs.springboot.domain.binance.autotrade.model.AutoTradeFuturesAlgoOrder;
import com.chs.springboot.domain.binance.autotrade.model.AutoTradeFuturesPosition;
import com.chs.springboot.domain.binance.autotrade.model.AutoTradeOrderRequest;
import com.chs.springboot.domain.binance.autotrade.model.AutoTradeOrderSubmission;
import com.chs.springboot.domain.binance.autotrade.model.AutoTradeOrderSubmissionKind;
import com.chs.springboot.domain.binance.autotrade.model.AutoTradeOrderTimeInForce;
import com.chs.springboot.domain.binance.autotrade.model.AutoTradeOrderType;
import com.chs.springboot.domain.binance.autotrade.model.AutoTradeProtectionKind;
import com.chs.springboot.domain.binance.autotrade.model.AutoTradeSide;
import com.chs.springboot.domain.binance.autotrade.model.AutoTradeStrategyConfig;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.math.BigDecimal;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class AutoTradeProtectionServiceTest {

    @Test
    void blocksWhenAForeignConditionalOrderExists() {
        AutoTradeFuturesAlgoReadOnlyClient readOnly = mock(AutoTradeFuturesAlgoReadOnlyClient.class);
        AutoTradeFuturesApiClient apiClient = mock(AutoTradeFuturesApiClient.class);
        AutoTradeSymbolRulesClient rulesClient = mock(AutoTradeSymbolRulesClient.class);
        AutoTradeOrderExecutor orderExecutor = mock(AutoTradeOrderExecutor.class);
        when(readOnly.openOrders("ENAUSDT")).thenReturn(List.of(
                algo(10L, "manual_1", "TAKE_PROFIT_MARKET", "SELL", "102", "10")));

        AutoTradeProtectionService service = new AutoTradeProtectionService(
                readOnly, apiClient, rulesClient, orderExecutor);

        assertThat(service.ensure(AutoTradeExecutionMode.LIVE, AutoTradeStrategyConfig.testDefaults(), position()).kind())
                .isEqualTo(AutoTradeProtectionKind.BLOCKED);
        verify(orderExecutor, never()).execute(any(), any());
        verify(apiClient, never()).deleteSigned(anyString(), any());
    }

    @Test
    void refreshesOnlyItsOwnProtectionOrdersWhenPricesAreStale() {
        AutoTradeFuturesAlgoReadOnlyClient readOnly = mock(AutoTradeFuturesAlgoReadOnlyClient.class);
        AutoTradeFuturesApiClient apiClient = mock(AutoTradeFuturesApiClient.class);
        AutoTradeSymbolRulesClient rulesClient = mock(AutoTradeSymbolRulesClient.class);
        AutoTradeOrderExecutor orderExecutor = mock(AutoTradeOrderExecutor.class);
        when(readOnly.openOrders("ENAUSDT")).thenReturn(List.of(
                algo(11L, "at_tp_old", "TAKE_PROFIT_MARKET", "SELL", "101", "10"),
                algo(12L, "at_sl_old", "STOP_MARKET", "SELL", "99", "10")
        ));
        when(rulesClient.rules("ENAUSDT")).thenReturn(new com.chs.springboot.domain.binance.autotrade.model.AutoTradeSymbolRules(
                "ENAUSDT", new BigDecimal("1"), new BigDecimal("1"),
                new BigDecimal("5"), new BigDecimal("1")));
        when(orderExecutor.execute(any(), any())).thenAnswer(invocation ->
                new AutoTradeOrderSubmission(AutoTradeOrderSubmissionKind.LIVE_ACCEPTED,
                        invocation.<com.chs.springboot.domain.binance.autotrade.model.AutoTradeOrderRequest>getArgument(1).action(),
                        "accepted", 1L, "accepted"));

        AutoTradeProtectionService service = new AutoTradeProtectionService(
                readOnly, apiClient, rulesClient, orderExecutor);

        assertThat(service.ensure(AutoTradeExecutionMode.LIVE, AutoTradeStrategyConfig.testDefaults(), position()).kind())
                .isEqualTo(AutoTradeProtectionKind.UPDATED);
        verify(apiClient).deleteSigned("/fapi/v1/algoOrder", java.util.Map.of("algoId", "11"));
        verify(apiClient).deleteSigned("/fapi/v1/algoOrder", java.util.Map.of("algoId", "12"));
        ArgumentCaptor<AutoTradeOrderRequest> requests = ArgumentCaptor.forClass(AutoTradeOrderRequest.class);
        verify(orderExecutor, org.mockito.Mockito.times(2)).execute(any(), requests.capture());
        assertThat(requests.getAllValues().get(0).type()).isEqualTo(AutoTradeOrderType.TAKE_PROFIT);
        assertThat(requests.getAllValues().get(0).price()).isEqualByComparingTo("102");
        assertThat(requests.getAllValues().get(0).timeInForce()).isEqualTo(AutoTradeOrderTimeInForce.GTC);
        assertThat(requests.getAllValues().get(1).type()).isEqualTo(AutoTradeOrderType.STOP_MARKET);
    }

    private AutoTradeFuturesPosition position() {
        return new AutoTradeFuturesPosition("ENAUSDT", AutoTradeSide.LONG,
                new BigDecimal("10"), new BigDecimal("100"), BigDecimal.ZERO, 1, true);
    }

    private AutoTradeFuturesAlgoOrder algo(long algoId,
                                           String id,
                                           String type,
                                           String side,
                                           String triggerPrice,
                                           String quantity) {
        return new AutoTradeFuturesAlgoOrder(
                algoId, id, "ENAUSDT", side, "BOTH", type, "NEW",
                new BigDecimal(quantity), new BigDecimal(triggerPrice), true, false);
    }
}
