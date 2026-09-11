package com.chs.springboot.domain.binance.autotrade.service;

import com.chs.springboot.domain.binance.autotrade.leader.AutoTradeExecutionRoute;
import com.chs.springboot.domain.binance.autotrade.leader.AutoTradeExecutionRouteKind;
import com.chs.springboot.domain.binance.autotrade.leader.AutoTradeExecutionRouter;
import com.chs.springboot.domain.binance.autotrade.model.AutoTradeActionKind;
import com.chs.springboot.domain.binance.autotrade.model.AutoTradeBookTicker;
import com.chs.springboot.domain.binance.autotrade.model.AutoTradeEntryDecision;
import com.chs.springboot.domain.binance.autotrade.model.AutoTradeExecutionMode;
import com.chs.springboot.domain.binance.autotrade.model.AutoTradeExecutionResult;
import com.chs.springboot.domain.binance.autotrade.model.AutoTradeExecutionSettings;
import com.chs.springboot.domain.binance.autotrade.model.AutoTradeOrderSubmission;
import com.chs.springboot.domain.binance.autotrade.model.AutoTradeOrderSubmissionKind;
import com.chs.springboot.domain.binance.autotrade.model.AutoTradePriceSnapshot;
import com.chs.springboot.domain.binance.autotrade.model.AutoTradeStrategyConfig;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doNothing;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class AutoTradeExecutionCoordinatorTest {

    @Test
    void paperModeFollowsEntryAndFirstMartingaleAddWithoutExchangeCalls() {
        AutoTradeConfigService configService = mock(AutoTradeConfigService.class);
        AutoTradeExecutionSettingsService settingsService = mock(AutoTradeExecutionSettingsService.class);
        AutoTradeExecutionRouter executionRouter = mock(AutoTradeExecutionRouter.class);
        AutoTradeLastPriceMonitor priceMonitor = mock(AutoTradeLastPriceMonitor.class);
        AutoTradeEntryDecisionService entryDecisionService = mock(AutoTradeEntryDecisionService.class);
        AutoTradeFuturesReadOnlyClient futuresClient = mock(AutoTradeFuturesReadOnlyClient.class);
        AutoTradeSymbolRulesClient symbolRulesClient = mock(AutoTradeSymbolRulesClient.class);
        AutoTradeOrderExecutor orderExecutor = mock(AutoTradeOrderExecutor.class);
        AutoTradeProtectionService protectionService = mock(AutoTradeProtectionService.class);
        AutoTradeAddCountStore addCountStore = mock(AutoTradeAddCountStore.class);
        AutoTradePendingOrderStore pendingOrderStore = mock(AutoTradePendingOrderStore.class);
        AutoTradePaperPositionStore paperPositionStore = new AutoTradePaperPositionStore();
        AtomicReference<com.chs.springboot.domain.binance.autotrade.model.AutoTradeOrderRequest> submitted = new AtomicReference<>();
        AutoTradeStrategyConfig config = AutoTradeStrategyConfig.testDefaults();
        AtomicReference<AutoTradePriceSnapshot> price = new AtomicReference<>(
                new AutoTradePriceSnapshot(new BigDecimal("100"), null));

        when(configService.current()).thenReturn(config);
        when(settingsService.current()).thenReturn(
                new AutoTradeExecutionSettings(AutoTradeExecutionMode.PAPER, 100, 250, 1_000, 0));
        when(executionRouter.route()).thenReturn(new AutoTradeExecutionRoute(
                AutoTradeExecutionRouteKind.EXECUTE_HERE, "DOCKER1", "test"));
        when(priceMonitor.latest()).thenAnswer(invocation -> Optional.ofNullable(price.get()));
        when(priceMonitor.latestQuote()).thenReturn(Optional.of(new AutoTradeBookTicker(
                "ENAUSDT", new BigDecimal("99.9"), new BigDecimal("100.1"), 1700000000000L)));
        doNothing().when(priceMonitor).ensureCurrentSymbol();
        when(entryDecisionService.decide()).thenReturn(new AutoTradeEntryDecision(
                com.chs.springboot.domain.binance.autotrade.model.AutoTradeSide.LONG, "test"));
        when(symbolRulesClient.rules("ENAUSDT")).thenReturn(new com.chs.springboot.domain.binance.autotrade.model.AutoTradeSymbolRules(
                "ENAUSDT", new BigDecimal("0.001"), new BigDecimal("0.001"),
                new BigDecimal("5"), new BigDecimal("0.0001")));
        when(orderExecutor.execute(any(), any())).thenAnswer(invocation -> {
            com.chs.springboot.domain.binance.autotrade.model.AutoTradeOrderRequest request = invocation.getArgument(1);
            submitted.set(request);
            return new AutoTradeOrderSubmission(AutoTradeOrderSubmissionKind.PAPER_ACCEPTED,
                    request.action(), request.clientOrderId(), null, "paper");
        });

        AutoTradeExecutionCoordinator coordinator = new AutoTradeExecutionCoordinator(
                configService, settingsService, executionRouter, priceMonitor, entryDecisionService,
                futuresClient, symbolRulesClient, orderExecutor, protectionService,
                new AutoTradeRuleEngineFactory(), addCountStore, paperPositionStore, pendingOrderStore);

        AutoTradeExecutionResult entry = coordinator.runOnce();
        price.set(new AutoTradePriceSnapshot(new BigDecimal("99"), null));
        AutoTradeExecutionResult add = coordinator.runOnce();

        assertThat(entry.action()).isEqualTo(AutoTradeActionKind.ENTER);
        assertThat(submitted.get().type()).isEqualTo(com.chs.springboot.domain.binance.autotrade.model.AutoTradeOrderType.LIMIT);
        assertThat(submitted.get().timeInForce()).isEqualTo(com.chs.springboot.domain.binance.autotrade.model.AutoTradeOrderTimeInForce.GTX);
        assertThat(submitted.get().price()).isEqualByComparingTo("99.9");
        assertThat(add.action()).isEqualTo(AutoTradeActionKind.ADD);
        assertThat(paperPositionStore.get("ENAUSDT").addCount()).isEqualTo(1);
        org.mockito.Mockito.verify(futuresClient, org.mockito.Mockito.never()).snapshot("ENAUSDT");
    }
}
