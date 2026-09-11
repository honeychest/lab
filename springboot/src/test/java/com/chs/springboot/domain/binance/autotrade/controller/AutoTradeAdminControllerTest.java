package com.chs.springboot.domain.binance.autotrade.controller;

import com.chs.springboot.domain.binance.autotrade.forward.AutoTradeLeaderForwarder;
import com.chs.springboot.domain.binance.autotrade.leader.AutoTradeExecutionRoute;
import com.chs.springboot.domain.binance.autotrade.leader.AutoTradeExecutionRouteKind;
import com.chs.springboot.domain.binance.autotrade.leader.AutoTradeExecutionRouter;
import com.chs.springboot.domain.binance.autotrade.model.AutoTradeReconciliation;
import com.chs.springboot.domain.binance.autotrade.model.AutoTradeReconciliationKind;
import com.chs.springboot.domain.binance.autotrade.service.AutoTradeConfigService;
import com.chs.springboot.domain.binance.autotrade.service.AutoTradeLastPriceMonitor;
import com.chs.springboot.domain.binance.autotrade.service.AutoTradeReconciliationService;
import com.chs.springboot.domain.binance.autotrade.service.AutoTradeSymbolCatalogService;
import jakarta.servlet.http.HttpServletResponse;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyMap;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class AutoTradeAdminControllerTest {

    private final AutoTradeConfigService configService = mock(AutoTradeConfigService.class);
    private final AutoTradeExecutionRouter executionRouter = mock(AutoTradeExecutionRouter.class);
    private final AutoTradeLeaderForwarder forwarder = mock(AutoTradeLeaderForwarder.class);
    private final AutoTradeReconciliationService reconciliationService = mock(AutoTradeReconciliationService.class);
    private final AutoTradeSymbolCatalogService symbolCatalogService = mock(AutoTradeSymbolCatalogService.class);
    private final AutoTradeLastPriceMonitor priceMonitor = mock(AutoTradeLastPriceMonitor.class);
    private AutoTradeAdminController controller;

    @BeforeEach
    void setUp() {
        controller = new AutoTradeAdminController(
                configService,
                executionRouter,
                forwarder,
                reconciliationService,
                symbolCatalogService,
                priceMonitor);
        when(executionRouter.route()).thenReturn(new AutoTradeExecutionRoute(
                AutoTradeExecutionRouteKind.EXECUTE_HERE, "LOCAL", ""));
        when(configService.current()).thenReturn(com.chs.springboot.domain.binance.autotrade.model.AutoTradeStrategyConfig.testDefaults());
    }

    @Test
    void appliesSymbolChangeImmediatelyWhenAccountIsFlat() {
        when(reconciliationService.reconcile()).thenReturn(new AutoTradeReconciliation(
                AutoTradeReconciliationKind.FLAT, null, "포지션과 미체결 주문이 없습니다"));

        var response = controller.updateConfig(
                Map.of("symbol", "BTCUSDT"),
                new MockHttpServletRequest(),
                new MockHttpServletResponse());

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);
        verify(configService).update(Map.of("symbol", "BTCUSDT"));
        verify(priceMonitor).ensureCurrentSymbol();
    }

    @Test
    void blocksSymbolChangeWhenAccountIsNotFlat() {
        when(reconciliationService.reconcile()).thenReturn(new AutoTradeReconciliation(
                AutoTradeReconciliationKind.OPEN_POSITION, null, "현재 포지션을 확인했습니다"));

        var response = controller.updateConfig(
                Map.of("symbol", "BTCUSDT"),
                new MockHttpServletRequest(),
                new MockHttpServletResponse());

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
        verify(configService, never()).update(anyMap());
        verify(priceMonitor, never()).ensureCurrentSymbol();
    }

    @Test
    void updatesOtherStrategyValuesWithoutRequiringFlatAccount() {
        when(reconciliationService.reconcile()).thenReturn(new AutoTradeReconciliation(
                AutoTradeReconciliationKind.OPEN_POSITION, null, "현재 포지션을 확인했습니다"));

        var response = controller.updateConfig(
                Map.of("take-profit-pct", "0.03"),
                new MockHttpServletRequest(),
                new MockHttpServletResponse());

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);
        verify(configService).update(Map.of("take-profit-pct", "0.03"));
        verify(priceMonitor).ensureCurrentSymbol();
    }
}
