package com.chs.springboot.domain.binance.autotrade.service;

import com.chs.springboot.domain.binance.autotrade.model.AutoTradeFuturesAccountSnapshot;
import com.chs.springboot.domain.binance.autotrade.model.AutoTradeFuturesOrder;
import com.chs.springboot.domain.binance.autotrade.model.AutoTradeFuturesPosition;
import com.fasterxml.jackson.databind.JsonNode;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

@Component
public class AutoTradeFuturesReadOnlyClient {

    private final AutoTradeFuturesApiClient apiClient;

    public AutoTradeFuturesReadOnlyClient(AutoTradeFuturesApiClient apiClient) {
        this.apiClient = apiClient;
    }

    public boolean isConfigured() {
        return apiClient.isConfigured();
    }

    public AutoTradeFuturesAccountSnapshot snapshot(String symbol) {
        if (!isConfigured()) {
            throw new IllegalStateException("선물 API 키가 설정되지 않았습니다");
        }
        try {
            JsonNode account = apiClient.getSigned("/fapi/v3/account", Map.of());
            JsonNode orders = apiClient.getSigned("/fapi/v1/openOrders", Map.of("symbol", symbol));
            List<AutoTradeFuturesPosition> positions = AutoTradeFuturesResponseParser.positions(account)
                    .stream().filter(position -> symbol.equals(position.symbol())).toList();
            List<AutoTradeFuturesOrder> openOrders = AutoTradeFuturesResponseParser.openOrders(orders);
            return new AutoTradeFuturesAccountSnapshot(
                    decimal(account.path("availableBalance").asText("0")),
                    decimal(account.path("totalWalletBalance").asText("0")),
                    positions,
                    openOrders
            );
        } catch (RuntimeException e) {
            throw new IllegalStateException("선물 계정 상태 조회에 실패했습니다", e);
        }
    }

    public AutoTradeFuturesOrder order(String symbol, String clientOrderId) {
        if (!isConfigured()) {
            throw new IllegalStateException("선물 API 키가 설정되지 않았습니다");
        }
        JsonNode response = apiClient.getSigned("/fapi/v1/order", Map.of(
                "symbol", symbol,
                "origClientOrderId", clientOrderId));
        return AutoTradeFuturesResponseParser.openOrders(response).stream()
                .findFirst()
                .orElseThrow(() -> new IllegalStateException("대기 주문 조회 결과가 없습니다"));
    }

    private BigDecimal decimal(String value) {
        return new BigDecimal(value == null || value.isBlank() ? "0" : value);
    }
}
