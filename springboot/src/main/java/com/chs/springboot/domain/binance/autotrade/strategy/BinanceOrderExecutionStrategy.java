package com.chs.springboot.domain.binance.autotrade.strategy;

import com.chs.springboot.domain.binance.autotrade.model.AutoTradeExecutionMode;
import com.chs.springboot.domain.binance.autotrade.model.AutoTradeOrderRequest;
import com.chs.springboot.domain.binance.autotrade.model.AutoTradeOrderPositionSide;
import com.chs.springboot.domain.binance.autotrade.model.AutoTradeOrderSubmission;
import com.chs.springboot.domain.binance.autotrade.model.AutoTradeOrderSubmissionKind;
import com.chs.springboot.domain.binance.autotrade.service.AutoTradeFuturesApiClient;
import com.chs.springboot.domain.binance.autotrade.service.AutoTradeFuturesApiException;
import com.fasterxml.jackson.databind.JsonNode;

import java.util.LinkedHashMap;
import java.util.Map;

public abstract class BinanceOrderExecutionStrategy implements AutoTradeOrderExecutionStrategy {

    private final AutoTradeFuturesApiClient apiClient;

    protected BinanceOrderExecutionStrategy(AutoTradeFuturesApiClient apiClient) {
        this.apiClient = apiClient;
    }

    protected abstract String path();

    protected abstract AutoTradeExecutionMode executionMode();

    @Override
    public AutoTradeExecutionMode mode() {
        return executionMode();
    }

    @Override
    public AutoTradeOrderSubmission execute(AutoTradeOrderRequest request) {
        Map<String, String> parameters = new LinkedHashMap<>();
        boolean conditional = switch (request.type()) {
            case STOP, TAKE_PROFIT, STOP_MARKET, TAKE_PROFIT_MARKET -> true;
            default -> false;
        };
        if (conditional) {
            parameters.put("algoType", "CONDITIONAL");
        }
        parameters.put("symbol", request.symbol());
        parameters.put("side", request.side().name());
        parameters.put("type", request.type().name());
        parameters.put("quantity", request.quantity().stripTrailingZeros().toPlainString());
        parameters.put(conditional ? "clientAlgoId" : "newClientOrderId", request.clientOrderId());
        if (request.type() == com.chs.springboot.domain.binance.autotrade.model.AutoTradeOrderType.LIMIT
                || request.type() == com.chs.springboot.domain.binance.autotrade.model.AutoTradeOrderType.STOP
                || request.type() == com.chs.springboot.domain.binance.autotrade.model.AutoTradeOrderType.TAKE_PROFIT) {
            parameters.put("timeInForce", request.timeInForce().name());
        }
        if (request.positionSide() != AutoTradeOrderPositionSide.BOTH) {
            parameters.put("positionSide", request.positionSide().name());
        }
        if (request.price() != null) {
            parameters.put("price", request.price().stripTrailingZeros().toPlainString());
        }
        if (request.stopPrice() != null) {
            parameters.put(conditional ? "triggerPrice" : "stopPrice",
                    request.stopPrice().stripTrailingZeros().toPlainString());
        }
        if (request.reduceOnly()) {
            parameters.put("reduceOnly", "true");
        }

        try {
            JsonNode response = executeRequest(conditional, parameters);
            Long orderId = response.has("orderId")
                    ? response.path("orderId").asLong()
                    : response.has("algoId") ? response.path("algoId").asLong() : null;
            String clientOrderId = response.path("clientOrderId")
                    .asText(response.path("clientAlgoId").asText(request.clientOrderId()));
            return new AutoTradeOrderSubmission(
                    executionMode() == AutoTradeExecutionMode.TEST
                            ? AutoTradeOrderSubmissionKind.TEST_ACCEPTED
                            : AutoTradeOrderSubmissionKind.LIVE_ACCEPTED,
                    request.action(),
                    clientOrderId,
                    orderId,
                    executionMode() == AutoTradeExecutionMode.TEST
                            ? "TEST 주문 검증을 통과했습니다"
                            : "실거래 주문을 바이낸스에 제출했습니다"
            );
        } catch (AutoTradeFuturesApiException e) {
            AutoTradeOrderSubmissionKind kind = e.outcomeUnknown()
                    ? AutoTradeOrderSubmissionKind.UNKNOWN
                    : AutoTradeOrderSubmissionKind.REJECTED;
            return new AutoTradeOrderSubmission(
                    kind,
                    request.action(),
                    request.clientOrderId(),
                    null,
                    e.getMessage()
            );
        }
    }

    protected JsonNode executeRequest(boolean conditional, Map<String, String> parameters) {
        if (conditional && executionMode() == AutoTradeExecutionMode.LIVE) {
            return apiClient.postSigned("/fapi/v1/algoOrder", parameters);
        }
        return apiClient.postSigned(path(), parameters);
    }
}
