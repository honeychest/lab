package com.chs.springboot.domain.binance.autotrade.controller;

import com.chs.springboot.domain.binance.autotrade.service.AutoTradeConfigService;
import com.chs.springboot.domain.binance.autotrade.leader.AutoTradeExecutionRouteKind;
import com.chs.springboot.domain.binance.autotrade.leader.AutoTradeExecutionRouter;
import com.chs.springboot.domain.binance.autotrade.forward.AutoTradeForwardResponse;
import com.chs.springboot.domain.binance.autotrade.forward.AutoTradeLeaderForwarder;
import com.chs.springboot.domain.binance.autotrade.model.AutoTradeReconciliationKind;
import com.chs.springboot.domain.binance.autotrade.service.AutoTradeReconciliationService;
import com.chs.springboot.domain.binance.autotrade.service.AutoTradeLastPriceMonitor;
import com.chs.springboot.domain.binance.autotrade.service.AutoTradeSymbolCatalogService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
@RequestMapping("/api/admin/binance/autotrade")
public class AutoTradeAdminController {

    private final AutoTradeConfigService configService;
    private final AutoTradeExecutionRouter executionRouter;
    private final AutoTradeLeaderForwarder forwarder;
    private final AutoTradeReconciliationService reconciliationService;
    private final AutoTradeSymbolCatalogService symbolCatalogService;
    private final AutoTradeLastPriceMonitor priceMonitor;

    public AutoTradeAdminController(AutoTradeConfigService configService,
                                    AutoTradeExecutionRouter executionRouter,
                                    AutoTradeLeaderForwarder forwarder,
                                    AutoTradeReconciliationService reconciliationService,
                                    AutoTradeSymbolCatalogService symbolCatalogService,
                                    AutoTradeLastPriceMonitor priceMonitor) {
        this.configService = configService;
        this.executionRouter = executionRouter;
        this.forwarder = forwarder;
        this.reconciliationService = reconciliationService;
        this.symbolCatalogService = symbolCatalogService;
        this.priceMonitor = priceMonitor;
    }

    @GetMapping("/config")
    public ResponseEntity<?> getConfig(HttpServletRequest request,
                                       HttpServletResponse response) {
        AutoTradeForwardResponse forwarded = forwardIfNeeded(request, response, "GET", null);
        if (forwarded != null) {
            return forwarded.response();
        }
        return ResponseEntity.ok(configService.view());
    }

    @PatchMapping("/config")
    public ResponseEntity<?> updateConfig(@RequestBody Map<String, String> updates,
                                          HttpServletRequest request,
                                          HttpServletResponse response) {
        AutoTradeForwardResponse forwarded = forwardIfNeeded(request, response, "PATCH", updates);
        if (forwarded != null) {
            return ResponseEntity.status(forwarded.response().getStatusCode()).build();
        }
        String requestedSymbol = updates == null ? null : updates.get("symbol");
        String currentSymbol = configService.current().symbol();
        boolean symbolChanged = requestedSymbol != null
                && !requestedSymbol.trim().equalsIgnoreCase(currentSymbol);
        if (symbolChanged && reconciliationService.reconcile().kind() != AutoTradeReconciliationKind.FLAT) {
            return ResponseEntity.status(HttpStatus.CONFLICT)
                    .body(Map.of("message", "포지션 또는 미체결 주문이 있어 심볼을 변경할 수 없습니다."));
        }
        configService.update(updates);
        priceMonitor.ensureCurrentSymbol();
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/reconciliation")
    public ResponseEntity<?> reconciliation(HttpServletRequest request,
                                            HttpServletResponse response) {
        AutoTradeForwardResponse forwarded = forwardIfNeeded(request, response, "GET", null,
                "/api/admin/binance/autotrade/reconciliation");
        if (forwarded != null) {
            return ResponseEntity.status(forwarded.response().getStatusCode())
                    .body(forwarded.response().getBody());
        }
        return ResponseEntity.ok(reconciliationService.reconcile());
    }

    @GetMapping("/symbols")
    public ResponseEntity<?> symbols(HttpServletRequest request,
                                     HttpServletResponse response) {
        AutoTradeForwardResponse forwarded = forwardIfNeeded(request, response, "GET", null,
                "/api/admin/binance/autotrade/symbols");
        if (forwarded != null) {
            return ResponseEntity.status(forwarded.response().getStatusCode())
                    .body(forwarded.response().getBody());
        }
        return ResponseEntity.ok(Map.of("symbols", symbolCatalogService.symbols()));
    }

    private AutoTradeForwardResponse forwardIfNeeded(HttpServletRequest request,
                                                     HttpServletResponse response,
                                                     String method,
                                                     Object body) {
        return forwardIfNeeded(request, response, method, body,
                "/api/admin/binance/autotrade/config");
    }

    private AutoTradeForwardResponse forwardIfNeeded(HttpServletRequest request,
                                                     HttpServletResponse response,
                                                     String method,
                                                     Object body,
                                                     String path) {
        if (executionRouter.route().kind() == AutoTradeExecutionRouteKind.EXECUTE_HERE) {
            return null;
        }
        AutoTradeForwardResponse forwarded = forwarder.forward(request, path, method, body);
        if (forwarded.setCookieHeader() != null) {
            response.addHeader("Set-Cookie", forwarded.setCookieHeader());
        }
        return forwarded;
    }
}
