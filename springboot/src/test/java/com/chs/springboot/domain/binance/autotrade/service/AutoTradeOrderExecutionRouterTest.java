package com.chs.springboot.domain.binance.autotrade.service;

import com.chs.springboot.domain.binance.autotrade.model.AutoTradeActionKind;
import com.chs.springboot.domain.binance.autotrade.model.AutoTradeExecutionMode;
import com.chs.springboot.domain.binance.autotrade.model.AutoTradeOrderPositionSide;
import com.chs.springboot.domain.binance.autotrade.model.AutoTradeOrderRequest;
import com.chs.springboot.domain.binance.autotrade.model.AutoTradeOrderSide;
import com.chs.springboot.domain.binance.autotrade.model.AutoTradeOrderSubmissionKind;
import com.chs.springboot.domain.binance.autotrade.model.AutoTradeOrderType;
import com.chs.springboot.domain.binance.autotrade.strategy.AutoTradeOrderExecutionStrategy;
import com.chs.springboot.domain.binance.autotrade.strategy.PaperOrderExecutionStrategy;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class AutoTradeOrderExecutionRouterTest {

    @Test
    void routesPaperOrdersByExecutionMode() {
        List<AutoTradeOrderExecutionStrategy> strategies = List.of(new PaperOrderExecutionStrategy());
        AutoTradeOrderExecutionRouter router = new AutoTradeOrderExecutionRouter(strategies);
        AutoTradeOrderRequest request = new AutoTradeOrderRequest(
                "ENAUSDT", AutoTradeActionKind.ENTER, AutoTradeOrderSide.BUY,
                AutoTradeOrderType.MARKET, AutoTradeOrderPositionSide.BOTH,
                new BigDecimal("5"), null, false, "test-order"
        );

        assertThat(router.execute(AutoTradeExecutionMode.PAPER, request).kind())
                .isEqualTo(AutoTradeOrderSubmissionKind.PAPER_ACCEPTED);
        assertThat(router.execute(AutoTradeExecutionMode.OFF, request).kind())
                .isEqualTo(AutoTradeOrderSubmissionKind.SKIPPED);
    }
}
