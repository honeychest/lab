package com.chs.springboot.domain.binance.autotrade.service;

import com.chs.springboot.domain.binance.autotrade.model.AutoTradeActionKind;
import com.chs.springboot.domain.binance.autotrade.model.AutoTradeExecutionMode;
import com.chs.springboot.domain.binance.autotrade.model.AutoTradeFuturesAlgoOrder;
import com.chs.springboot.domain.binance.autotrade.model.AutoTradeFuturesPosition;
import com.chs.springboot.domain.binance.autotrade.model.AutoTradeOrderPositionSide;
import com.chs.springboot.domain.binance.autotrade.model.AutoTradeOrderRequest;
import com.chs.springboot.domain.binance.autotrade.model.AutoTradeOrderSide;
import com.chs.springboot.domain.binance.autotrade.model.AutoTradeOrderSubmission;
import com.chs.springboot.domain.binance.autotrade.model.AutoTradeOrderType;
import com.chs.springboot.domain.binance.autotrade.model.AutoTradeOrderTimeInForce;
import com.chs.springboot.domain.binance.autotrade.model.AutoTradeProtectionKind;
import com.chs.springboot.domain.binance.autotrade.model.AutoTradeProtectionResult;
import com.chs.springboot.domain.binance.autotrade.model.AutoTradeSide;
import com.chs.springboot.domain.binance.autotrade.model.AutoTradeSymbolRules;
import com.chs.springboot.domain.binance.autotrade.model.AutoTradeStrategyConfig;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicLong;

@Service
public class AutoTradeProtectionService {

    private static final String OWN_PREFIX = "at_";

    private final AutoTradeFuturesAlgoReadOnlyClient algoReadOnlyClient;
    private final AutoTradeFuturesApiClient apiClient;
    private final AutoTradeSymbolRulesClient symbolRulesClient;
    private final AutoTradeOrderExecutor orderExecutor;
    private final AtomicLong sequence = new AtomicLong();

    public AutoTradeProtectionService(AutoTradeFuturesAlgoReadOnlyClient algoReadOnlyClient,
                                      AutoTradeFuturesApiClient apiClient,
                                      AutoTradeSymbolRulesClient symbolRulesClient,
                                      AutoTradeOrderExecutor orderExecutor) {
        this.algoReadOnlyClient = algoReadOnlyClient;
        this.apiClient = apiClient;
        this.symbolRulesClient = symbolRulesClient;
        this.orderExecutor = orderExecutor;
    }

    public AutoTradeProtectionResult ensure(AutoTradeExecutionMode mode,
                                            AutoTradeStrategyConfig config,
                                            AutoTradeFuturesPosition position) {
        if (mode != AutoTradeExecutionMode.LIVE) {
            return new AutoTradeProtectionResult(AutoTradeProtectionKind.NOT_REQUIRED,
                    "실거래가 아니므로 서버 보호 주문을 만들지 않습니다");
        }
        List<AutoTradeFuturesAlgoOrder> orders;
        try {
            orders = algoReadOnlyClient.openOrders(config.symbol());
        } catch (RuntimeException e) {
            return new AutoTradeProtectionResult(AutoTradeProtectionKind.FAILED,
                    "기존 서버 보호 주문을 확인하지 못했습니다");
        }
        List<AutoTradeFuturesAlgoOrder> ownOrders = orders.stream()
                .filter(order -> order.clientAlgoId().startsWith(OWN_PREFIX))
                .toList();
        if (orders.stream().anyMatch(order -> !order.clientAlgoId().startsWith(OWN_PREFIX))) {
            return new AutoTradeProtectionResult(AutoTradeProtectionKind.BLOCKED,
                    "사용자 또는 다른 전략의 서버 조건부 주문이 있어 자동매매를 보류합니다");
        }

        AutoTradeSymbolRules rules = symbolRulesClient.rules(config.symbol());
        BigDecimal takeProfitPrice = AutoTradeOrderPriceCalculator.takeProfit(
                position.side(), position.entryPrice(), config.takeProfitPct(), rules.priceTick());
        BigDecimal stopLossPrice = AutoTradeOrderPriceCalculator.stopLoss(
                position.side(), position.entryPrice(), config.stopLossPct(), rules.priceTick());
        AutoTradeOrderSide exitSide = position.side() == AutoTradeSide.LONG
                ? AutoTradeOrderSide.SELL : AutoTradeOrderSide.BUY;
        boolean hasTakeProfit = ownOrders.stream().anyMatch(order -> matches(
                order, "TAKE_PROFIT", exitSide, position.quantity(), takeProfitPrice, takeProfitPrice));
        boolean hasStopLoss = ownOrders.stream().anyMatch(order -> matches(
                order, "STOP_MARKET", exitSide, position.quantity(), BigDecimal.ZERO, stopLossPrice));
        if (hasTakeProfit && hasStopLoss && ownOrders.size() == 2) {
            return new AutoTradeProtectionResult(AutoTradeProtectionKind.READY,
                    "익절·손절 서버 보호 주문이 최신 설정과 일치합니다");
        }

        if (!cancelOwn(ownOrders)) {
            return new AutoTradeProtectionResult(AutoTradeProtectionKind.FAILED,
                    "기존 자동매매 보호 주문을 취소하지 못했습니다");
        }
        AutoTradeOrderSubmission takeProfit = orderExecutor.execute(mode, new AutoTradeOrderRequest(
                config.symbol(), AutoTradeActionKind.TAKE_PROFIT, exitSide,
                AutoTradeOrderType.TAKE_PROFIT, AutoTradeOrderPositionSide.BOTH,
                position.quantity(), takeProfitPrice, takeProfitPrice,
                AutoTradeOrderTimeInForce.GTC, true, clientId("tp")
        ));
        if (!takeProfit.accepted()) {
            return new AutoTradeProtectionResult(AutoTradeProtectionKind.FAILED,
                    "익절 서버 보호 주문을 만들지 못했습니다: " + takeProfit.message());
        }
        AutoTradeOrderSubmission stopLoss = orderExecutor.execute(mode, new AutoTradeOrderRequest(
                config.symbol(), AutoTradeActionKind.STOP_LOSS, exitSide,
                AutoTradeOrderType.STOP_MARKET, AutoTradeOrderPositionSide.BOTH,
                position.quantity(), stopLossPrice, true, clientId("sl")
        ));
        if (!stopLoss.accepted()) {
            return new AutoTradeProtectionResult(AutoTradeProtectionKind.FAILED,
                    "손절 서버 보호 주문을 만들지 못했습니다: " + stopLoss.message());
        }
        return new AutoTradeProtectionResult(AutoTradeProtectionKind.UPDATED,
                "익절·손절 서버 보호 주문을 갱신했습니다");
    }

    public AutoTradeProtectionResult clear(AutoTradeExecutionMode mode, String symbol) {
        if (mode != AutoTradeExecutionMode.LIVE) {
            return new AutoTradeProtectionResult(AutoTradeProtectionKind.NOT_REQUIRED,
                    "실거래가 아니므로 서버 보호 주문을 취소하지 않습니다");
        }
        try {
            List<AutoTradeFuturesAlgoOrder> orders = algoReadOnlyClient.openOrders(symbol);
            if (orders.stream().anyMatch(order -> !order.clientAlgoId().startsWith(OWN_PREFIX))) {
                return new AutoTradeProtectionResult(AutoTradeProtectionKind.BLOCKED,
                        "사용자 또는 다른 전략의 서버 조건부 주문이 있어 자동매매를 보류합니다");
            }
            List<AutoTradeFuturesAlgoOrder> ownOrders = orders.stream()
                    .filter(order -> order.clientAlgoId().startsWith(OWN_PREFIX))
                    .toList();
            if (!cancelOwn(ownOrders)) {
                return new AutoTradeProtectionResult(AutoTradeProtectionKind.FAILED,
                        "자동매매 보호 주문을 취소하지 못했습니다");
            }
            return new AutoTradeProtectionResult(
                    ownOrders.isEmpty() ? AutoTradeProtectionKind.READY : AutoTradeProtectionKind.UPDATED,
                    ownOrders.isEmpty() ? "자동매매 보호 주문이 없습니다" : "자동매매 보호 주문을 취소했습니다");
        } catch (RuntimeException e) {
            return new AutoTradeProtectionResult(AutoTradeProtectionKind.FAILED,
                    "자동매매 보호 주문을 확인하지 못했습니다");
        }
    }

    private boolean cancelOwn(List<AutoTradeFuturesAlgoOrder> ownOrders) {
        for (AutoTradeFuturesAlgoOrder order : ownOrders) {
            try {
                apiClient.deleteSigned("/fapi/v1/algoOrder", Map.of(
                        "algoId", String.valueOf(order.algoId())));
            } catch (RuntimeException e) {
                return false;
            }
        }
        return true;
    }

    private boolean matches(AutoTradeFuturesAlgoOrder order,
                            String expectedType,
                            AutoTradeOrderSide expectedSide,
                            BigDecimal quantity,
                            BigDecimal expectedPrice,
                            BigDecimal triggerPrice) {
        return expectedType.equalsIgnoreCase(order.orderType())
                && expectedSide.name().equalsIgnoreCase(order.side())
                && order.quantity().compareTo(quantity) == 0
                && order.price().compareTo(expectedPrice) == 0
                && order.triggerPrice().compareTo(triggerPrice) == 0
                && (order.status().isBlank() || "NEW".equalsIgnoreCase(order.status()));
    }

    private String clientId(String type) {
        return OWN_PREFIX + type + "_" + System.currentTimeMillis() + "_" + sequence.incrementAndGet();
    }

}
