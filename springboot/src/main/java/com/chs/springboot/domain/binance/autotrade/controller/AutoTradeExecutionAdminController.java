package com.chs.springboot.domain.binance.autotrade.controller;

import com.chs.springboot.domain.binance.autotrade.forward.AutoTradeForwardResponse;
import com.chs.springboot.domain.binance.autotrade.forward.AutoTradeLeaderForwarder;
import com.chs.springboot.domain.binance.autotrade.leader.AutoTradeExecutionRouteKind;
import com.chs.springboot.domain.binance.autotrade.leader.AutoTradeExecutionRouter;
import com.chs.springboot.domain.binance.autotrade.service.AutoTradeExecutionCoordinator;
import com.chs.springboot.domain.binance.autotrade.service.AutoTradeExecutionSettingsService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
@RequestMapping("/api/admin/binance/autotrade/execution")
public class AutoTradeExecutionAdminController {

    private final AutoTradeExecutionSettingsService settingsService;
    private final AutoTradeExecutionCoordinator coordinator;
    private final AutoTradeExecutionRouter executionRouter;
    private final AutoTradeLeaderForwarder forwarder;

    public AutoTradeExecutionAdminController(AutoTradeExecutionSettingsService settingsService,
                                             AutoTradeExecutionCoordinator coordinator,
                                             AutoTradeExecutionRouter executionRouter,
                                             AutoTradeLeaderForwarder forwarder) {
        this.settingsService = settingsService;
        this.coordinator = coordinator;
        this.executionRouter = executionRouter;
        this.forwarder = forwarder;
    }

    @GetMapping
    public ResponseEntity<?> getSettings(HttpServletRequest request,
                                         HttpServletResponse response) {
        AutoTradeForwardResponse forwarded = forwardIfNeeded(request, response, "GET", null,
                "/api/admin/binance/autotrade/execution");
        if (forwarded != null) {
            return forwarded.response();
        }
        return ResponseEntity.ok(settingsService.view());
    }

    @PatchMapping
    public ResponseEntity<Void> updateSettings(@RequestBody Map<String, String> updates,
                                               HttpServletRequest request,
                                               HttpServletResponse response) {
        AutoTradeForwardResponse forwarded = forwardIfNeeded(request, response, "PATCH", updates,
                "/api/admin/binance/autotrade/execution");
        if (forwarded != null) {
            return ResponseEntity.status(forwarded.response().getStatusCode()).build();
        }
        settingsService.update(updates);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/run-once")
    public ResponseEntity<?> runOnce(HttpServletRequest request,
                                     HttpServletResponse response) {
        AutoTradeForwardResponse forwarded = forwardIfNeeded(request, response, "POST", null,
                "/api/admin/binance/autotrade/execution/run-once");
        if (forwarded != null) {
            return ResponseEntity.status(forwarded.response().getStatusCode())
                    .body(forwarded.response().getBody());
        }
        return ResponseEntity.ok(coordinator.runOnce());
    }

    @GetMapping("/status")
    public ResponseEntity<?> status(HttpServletRequest request,
                                    HttpServletResponse response) {
        AutoTradeForwardResponse forwarded = forwardIfNeeded(request, response, "GET", null,
                "/api/admin/binance/autotrade/execution/status");
        if (forwarded != null) {
            return forwarded.response();
        }
        return ResponseEntity.ok(coordinator.status());
    }

    @PostMapping("/reset-unknown-order")
    public ResponseEntity<Void> resetUnknownOrder(HttpServletRequest request,
                                                  HttpServletResponse response) {
        AutoTradeForwardResponse forwarded = forwardIfNeeded(request, response, "POST", null,
                "/api/admin/binance/autotrade/execution/reset-unknown-order");
        if (forwarded != null) {
            return ResponseEntity.status(forwarded.response().getStatusCode()).build();
        }
        coordinator.resetUnknownOrderBlock();
        return ResponseEntity.noContent().build();
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
