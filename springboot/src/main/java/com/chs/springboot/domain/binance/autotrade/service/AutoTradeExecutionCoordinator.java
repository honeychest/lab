package com.chs.springboot.domain.binance.autotrade.service;

import com.chs.springboot.domain.binance.autotrade.leader.AutoTradeExecutionRouteKind;
import com.chs.springboot.domain.binance.autotrade.leader.AutoTradeExecutionRouter;
import com.chs.springboot.domain.binance.autotrade.model.AutoTradeActionKind;
import com.chs.springboot.domain.binance.autotrade.model.AutoTradeBookTicker;
import com.chs.springboot.domain.binance.autotrade.model.AutoTradeEntryDecision;
import com.chs.springboot.domain.binance.autotrade.model.AutoTradeEvaluation;
import com.chs.springboot.domain.binance.autotrade.model.AutoTradeExecutionMode;
import com.chs.springboot.domain.binance.autotrade.model.AutoTradeExecutionPolicy;
import com.chs.springboot.domain.binance.autotrade.model.AutoTradeExecutionResult;
import com.chs.springboot.domain.binance.autotrade.model.AutoTradeExecutionSettings;
import com.chs.springboot.domain.binance.autotrade.model.AutoTradeFuturesAccountSnapshot;
import com.chs.springboot.domain.binance.autotrade.model.AutoTradeFuturesOrder;
import com.chs.springboot.domain.binance.autotrade.model.AutoTradeFuturesPosition;
import com.chs.springboot.domain.binance.autotrade.model.AutoTradeOrderPositionSide;
import com.chs.springboot.domain.binance.autotrade.model.AutoTradeOrderRequest;
import com.chs.springboot.domain.binance.autotrade.model.AutoTradeOrderSide;
import com.chs.springboot.domain.binance.autotrade.model.AutoTradeOrderSubmission;
import com.chs.springboot.domain.binance.autotrade.model.AutoTradeOrderSubmissionKind;
import com.chs.springboot.domain.binance.autotrade.model.AutoTradeOrderType;
import com.chs.springboot.domain.binance.autotrade.model.AutoTradeOrderTimeInForce;
import com.chs.springboot.domain.binance.autotrade.model.AutoTradePendingOrder;
import com.chs.springboot.domain.binance.autotrade.model.AutoTradePaperPosition;
import com.chs.springboot.domain.binance.autotrade.model.AutoTradePositionState;
import com.chs.springboot.domain.binance.autotrade.model.AutoTradePriceSnapshot;
import com.chs.springboot.domain.binance.autotrade.model.AutoTradeProtectionKind;
import com.chs.springboot.domain.binance.autotrade.model.AutoTradeProtectionResult;
import com.chs.springboot.domain.binance.autotrade.model.AutoTradeSide;
import com.chs.springboot.domain.binance.autotrade.model.AutoTradeStrategyConfig;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicLong;

@Slf4j
@Service
public class AutoTradeExecutionCoordinator {

    private final AutoTradeConfigService configService;
    private final AutoTradeExecutionSettingsService settingsService;
    private final AutoTradeExecutionRouter executionRouter;
    private final AutoTradeLastPriceMonitor priceMonitor;
    private final AutoTradeEntryDecisionService entryDecisionService;
    private final AutoTradeFuturesReadOnlyClient futuresClient;
    private final AutoTradeSymbolRulesClient symbolRulesClient;
    private final AutoTradeOrderExecutor orderExecutor;
    private final AutoTradeProtectionService protectionService;
    private final AutoTradeRuleEngineFactory ruleEngineFactory;
    private final AutoTradeAddCountStore addCountStore;
    private final AutoTradePaperPositionStore paperPositionStore;
    private final AutoTradePendingOrderStore pendingOrderStore;
    private final AtomicBoolean running = new AtomicBoolean();
    private final AtomicLong orderSequence = new AtomicLong();

    private volatile AutoTradeFuturesAccountSnapshot cachedAccount;
    private volatile String cachedAccountSymbol;
    private volatile long cachedAccountAtMs;
    private volatile long nextActionAllowedAtMs;
    private volatile long lastEntryAnalysisAtMs;
    private volatile boolean accountRefreshedOnLastRead;
    private volatile boolean protectionReady = true;
    private volatile boolean unknownOrderBlocked;
    private volatile AutoTradeStrategyConfig cachedStrategyConfig;
    private volatile long cachedStrategyConfigAtMs;
    private volatile AutoTradeExecutionResult lastResult = new AutoTradeExecutionResult(
            AutoTradeExecutionMode.OFF, AutoTradeActionKind.NO_ACTION, null, null, "아직 실행하지 않았습니다");

    public AutoTradeExecutionCoordinator(AutoTradeConfigService configService,
                                         AutoTradeExecutionSettingsService settingsService,
                                         AutoTradeExecutionRouter executionRouter,
                                         AutoTradeLastPriceMonitor priceMonitor,
                                         AutoTradeEntryDecisionService entryDecisionService,
                                         AutoTradeFuturesReadOnlyClient futuresClient,
                                         AutoTradeSymbolRulesClient symbolRulesClient,
                                         AutoTradeOrderExecutor orderExecutor,
                                         AutoTradeProtectionService protectionService,
                                         AutoTradeRuleEngineFactory ruleEngineFactory,
                                         AutoTradeAddCountStore addCountStore,
                                         AutoTradePaperPositionStore paperPositionStore,
                                         AutoTradePendingOrderStore pendingOrderStore) {
        this.configService = configService;
        this.settingsService = settingsService;
        this.executionRouter = executionRouter;
        this.priceMonitor = priceMonitor;
        this.entryDecisionService = entryDecisionService;
        this.futuresClient = futuresClient;
        this.symbolRulesClient = symbolRulesClient;
        this.orderExecutor = orderExecutor;
        this.protectionService = protectionService;
        this.ruleEngineFactory = ruleEngineFactory;
        this.addCountStore = addCountStore;
        this.paperPositionStore = paperPositionStore;
        this.pendingOrderStore = pendingOrderStore;
    }

    public AutoTradeExecutionResult runOnce() {
        return runOnce(false);
    }

    public AutoTradeExecutionResult runScheduledOnce() {
        return runOnce(true);
    }

    private AutoTradeExecutionResult runOnce(boolean scheduled) {
        if (!running.compareAndSet(false, true)) {
            return lastResult;
        }
        try {
            AutoTradeExecutionResult result = executeOnce(scheduled);
            lastResult = result;
            return result;
        } catch (RuntimeException e) {
            log.warn("[AutoTrade] 실행 단계가 실패했습니다: {}", e.getMessage());
            AutoTradeExecutionMode mode = settingsService.current().mode();
            AutoTradeExecutionResult result = result(mode, AutoTradeActionKind.NO_ACTION, null,
                    latestSnapshot(), "자동매매 실행 중 오류가 발생했습니다");
            lastResult = result;
            return result;
        } finally {
            running.set(false);
        }
    }

    public Map<String, Object> status() {
        AutoTradeExecutionSettings settings = settingsService.current();
        var route = executionRouter.route();
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("mode", settings.mode());
        result.put("policy", settings.policy());
        result.put("route", route.kind());
        result.put("leader", route.leaderName());
        result.put("running", running.get());
        result.put("unknownOrderBlocked", unknownOrderBlocked);
        result.put("latestPrice", latestPrice());
        result.put("latestPriceSymbol", priceMonitor.latestPriceSymbol());
        result.put("lastResult", lastResult);
        return result;
    }

    private AutoTradeExecutionResult executeOnce(boolean scheduled) {
        AutoTradeExecutionSettings settings = settingsService.current();
        if (scheduled && settings.policy() != AutoTradeExecutionPolicy.AUTO) {
            return result(settings.mode(), AutoTradeActionKind.NO_ACTION, null, latestSnapshot(),
                    "자동 실행 방식이 MANUAL입니다");
        }
        if (settings.mode() == AutoTradeExecutionMode.OFF) {
            return result(settings.mode(), AutoTradeActionKind.NO_ACTION, null, latestSnapshot(),
                    "자동매매 실행 모드가 OFF입니다");
        }
        if (executionRouter.route().kind() != AutoTradeExecutionRouteKind.EXECUTE_HERE) {
            return result(settings.mode(), AutoTradeActionKind.NO_ACTION, null, latestSnapshot(),
                    "현재 서버는 자동매매 실행 리더가 아닙니다");
        }
        AutoTradePriceSnapshot price = priceMonitor.latest().orElse(null);
        if (price == null) {
            return result(settings.mode(), AutoTradeActionKind.NO_ACTION, null, null,
                    "실시간 가격이 아직 준비되지 않았습니다");
        }

        priceMonitor.ensureCurrentSymbol();
        price = priceMonitor.latest().orElse(null);
        if (price == null) {
            return result(settings.mode(), AutoTradeActionKind.NO_ACTION, null, null,
                    "심볼 변경 후 실시간 가격을 기다리고 있습니다");
        }
        AutoTradeStrategyConfig config = currentStrategyConfig();
        if (settings.mode() == AutoTradeExecutionMode.PAPER) {
            return executePaper(settings, config, price);
        }
        return executeAgainstBinance(settings, config, price);
    }

    private AutoTradeExecutionResult executePaper(AutoTradeExecutionSettings settings,
                                                  AutoTradeStrategyConfig config,
                                                  AutoTradePriceSnapshot price) {
        AutoTradePaperPosition paperPosition = paperPositionStore.get(config.symbol());
        AutoTradePositionState position = paperPosition == null ? null : new AutoTradePositionState(
                paperPosition.side(),
                paperPosition.averageEntryPrice(),
                paperPosition.quantity().multiply(price.lastPrice()),
                paperPosition.addCount()
        );
        AutoTradeEntryDecision entryDecision = position == null
                ? entryDecisionIfDue(settings)
                : AutoTradeEntryDecision.noTrade("포지션이 있어 신규 진입 분석을 건너뜁니다");
        AutoTradeExecutionResult evaluationResult = evaluate(settings.mode(), config, price, position, entryDecision);
        if (evaluationResult != null) {
            return evaluationResult;
        }
        AutoTradeEvaluation evaluation = evaluateAction(config, price, position, entryDecision);
        if (!isExecutableAction(evaluation.kind())) {
            return result(settings.mode(), evaluation.kind(), null, price, evaluation.reason());
        }
        AutoTradeBookTicker quote = priceMonitor.latestQuote().orElse(null);
        if ((evaluation.kind() == AutoTradeActionKind.ENTER || evaluation.kind() == AutoTradeActionKind.ADD)
                && quote == null) {
            return result(settings.mode(), AutoTradeActionKind.NO_ACTION, null, price,
                    "진입용 실시간 호가가 아직 준비되지 않았습니다");
        }
        BigDecimal orderPrice = orderPrice(config, evaluation, quote);
        BigDecimal quantity = quantity(config,
                orderPrice == null ? price.lastPrice() : orderPrice, evaluation, paperPosition);
        AutoTradeOrderRequest request = request(config, evaluation, quantity, orderPrice);
        AutoTradeOrderSubmission submission = orderExecutor.execute(settings.mode(), request);
        if (submission.accepted()) {
            applyPaperFill(config.symbol(), price.lastPrice(), request, quantity, paperPosition);
        }
        nextActionAllowedAtMs = System.currentTimeMillis() + settings.orderCooldownMs();
        return result(settings.mode(), evaluation.kind(), submission, price,
                submission.message());
    }

    private AutoTradeExecutionResult executeAgainstBinance(AutoTradeExecutionSettings settings,
                                                           AutoTradeStrategyConfig config,
                                                           AutoTradePriceSnapshot price) {
        if (!futuresClient.isConfigured()) {
            return result(settings.mode(), AutoTradeActionKind.NO_ACTION, rejected(null,
                            "자동매매 전용 선물 API 키가 설정되지 않았습니다"), price,
                    "자동매매 전용 선물 API 키가 설정되지 않았습니다");
        }
        if (unknownOrderBlocked) {
            return result(settings.mode(), AutoTradeActionKind.NO_ACTION, null, price,
                    "주문 결과를 확인할 수 없어 자동 주문을 중지했습니다. 바이낸스 상태 확인 후 차단을 해제해야 합니다");
        }
        if (System.currentTimeMillis() < nextActionAllowedAtMs) {
            return result(settings.mode(), AutoTradeActionKind.NO_ACTION, null, price,
                    "직전 주문 처리 대기 중입니다");
        }
        AutoTradeFuturesAccountSnapshot account = account(settings, config.symbol());
        if (account == null) {
            return result(settings.mode(), AutoTradeActionKind.NO_ACTION, null, price,
                    "바이낸스 선물 계정 상태를 확인하지 못했습니다");
        }
        AutoTradeExecutionResult pendingResult = reconcilePendingOrder(settings, config, account, price);
        if (pendingResult != null) {
            return pendingResult;
        }
        if (!account.openOrders().isEmpty()) {
            return result(settings.mode(), AutoTradeActionKind.NO_ACTION, null, price,
                    "심볼에 미체결 주문이 있어 자동 주문을 보류합니다");
        }
        if (account.positions().size() > 1) {
            return result(settings.mode(), AutoTradeActionKind.NO_ACTION, null, price,
                    "복수 포지션 상태라 자동 주문을 보류합니다");
        }
        AutoTradeFuturesPosition exchangePosition = account.positions().isEmpty()
                ? null : account.positions().get(0);
        if (exchangePosition == null) {
            protectionReady = true;
            if (settings.mode() == AutoTradeExecutionMode.LIVE && accountRefreshedOnLastRead) {
                AutoTradeProtectionResult cleared = protectionService.clear(settings.mode(), config.symbol());
                if (!cleared.canTrade()) {
                    return result(settings.mode(), AutoTradeActionKind.NO_ACTION, null, price,
                            cleared.message());
                }
            }
        } else if (settings.mode() == AutoTradeExecutionMode.LIVE) {
            if (accountRefreshedOnLastRead) {
                AutoTradeProtectionResult protection = protectionService.ensure(
                        settings.mode(), config, exchangePosition);
                protectionReady = protection.kind() == AutoTradeProtectionKind.READY;
                if (protection.kind() != AutoTradeProtectionKind.READY) {
                    return result(settings.mode(), AutoTradeActionKind.NO_ACTION, null, price,
                            protection.message());
                }
            }
            if (!protectionReady) {
                return result(settings.mode(), AutoTradeActionKind.NO_ACTION, null, price,
                        "서버 보호 주문이 최신 상태가 될 때까지 자동 주문을 보류합니다");
            }
        }
        AutoTradePositionState position = exchangePosition == null ? null : new AutoTradePositionState(
                exchangePosition.side(),
                exchangePosition.entryPrice(),
                exchangePosition.quantity().multiply(price.lastPrice()),
                addCountStore.get(config.symbol(), exchangePosition.side())
        );
        AutoTradeEntryDecision entryDecision = position == null
                ? entryDecisionIfDue(settings)
                : AutoTradeEntryDecision.noTrade("포지션이 있어 신규 진입 분석을 건너뜁니다");
        AutoTradeExecutionResult evaluationResult = evaluate(settings.mode(), config, price, position, entryDecision);
        if (evaluationResult != null) {
            return evaluationResult;
        }
        AutoTradeEvaluation evaluation = evaluateAction(config, price, position, entryDecision);
        if (!isExecutableAction(evaluation.kind())) {
            return result(settings.mode(), evaluation.kind(), null, price, evaluation.reason());
        }
        AutoTradeBookTicker quote = priceMonitor.latestQuote().orElse(null);
        if ((evaluation.kind() == AutoTradeActionKind.ENTER || evaluation.kind() == AutoTradeActionKind.ADD)
                && quote == null) {
            return result(settings.mode(), AutoTradeActionKind.NO_ACTION, null, price,
                    "진입용 실시간 호가가 아직 준비되지 않았습니다");
        }
        BigDecimal orderPrice = orderPrice(config, evaluation, quote);
        BigDecimal quantity = quantity(config,
                orderPrice == null ? price.lastPrice() : orderPrice, evaluation, exchangePosition);
        AutoTradeOrderRequest request = request(config, evaluation, quantity, orderPrice);
        if (settings.mode() == AutoTradeExecutionMode.LIVE
                && (evaluation.kind() == AutoTradeActionKind.ADD || isExitAction(evaluation.kind()))) {
            AutoTradeProtectionResult cleared = protectionService.clear(settings.mode(), config.symbol());
            if (!cleared.canTrade()) {
                return result(settings.mode(), AutoTradeActionKind.NO_ACTION, null, price,
                        cleared.message());
            }
            protectionReady = false;
        }
        AutoTradeOrderSubmission submission = orderExecutor.execute(settings.mode(), request);
        if (submission.accepted() && settings.mode() == AutoTradeExecutionMode.LIVE) {
            if (request.type() == AutoTradeOrderType.LIMIT) {
                pendingOrderStore.set(new AutoTradePendingOrder(
                        config.symbol(), evaluation.kind(), evaluation.side(), request.clientOrderId()));
            } else {
                applyLiveSubmission(config.symbol(), evaluation.kind(), evaluation.side(), exchangePosition);
            }
        }
        if (submission.kind() == AutoTradeOrderSubmissionKind.UNKNOWN
                && settings.mode() == AutoTradeExecutionMode.LIVE) {
            unknownOrderBlocked = true;
        }
        if (submission.kind() == AutoTradeOrderSubmissionKind.REJECTED
                && evaluation.kind() == AutoTradeActionKind.ENTER) {
            lastEntryAnalysisAtMs = 0L;
        }
        cachedAccount = null;
        nextActionAllowedAtMs = System.currentTimeMillis() + settings.orderCooldownMs();
        return result(settings.mode(), evaluation.kind(), submission, price,
                submission.message());
    }

    public void resetUnknownOrderBlock() {
        unknownOrderBlocked = false;
        cachedAccount = null;
        nextActionAllowedAtMs = 0L;
    }

    private AutoTradeExecutionResult evaluate(AutoTradeExecutionMode mode,
                                              AutoTradeStrategyConfig config,
                                              AutoTradePriceSnapshot price,
                                              AutoTradePositionState position,
                                              AutoTradeEntryDecision entryDecision) {
        if (position != null && System.currentTimeMillis() < nextActionAllowedAtMs) {
            return result(mode, AutoTradeActionKind.NO_ACTION, null, price,
                    "직전 주문 처리 대기 중입니다");
        }
        return null;
    }

    private AutoTradeEvaluation evaluateAction(AutoTradeStrategyConfig config,
                                               AutoTradePriceSnapshot price,
                                               AutoTradePositionState position,
                                               AutoTradeEntryDecision entryDecision) {
        return ruleEngineFactory.create(config).evaluate(position, price, entryDecision, config);
    }

    private BigDecimal quantity(AutoTradeStrategyConfig config,
                                BigDecimal referencePrice,
                                AutoTradeEvaluation evaluation,
                                AutoTradePaperPosition paperPosition) {
        if (isExitAction(evaluation.kind()) && paperPosition != null) {
            return paperPosition.quantity();
        }
        if (evaluation.notional() == null) {
            throw new IllegalStateException("주문 명목금액이 없습니다");
        }
        return AutoTradeOrderQuantityCalculator.fromNotional(
                evaluation.notional(), referencePrice, symbolRulesClient.rules(config.symbol()));
    }

    private BigDecimal quantity(AutoTradeStrategyConfig config,
                                BigDecimal referencePrice,
                                AutoTradeEvaluation evaluation,
                                AutoTradeFuturesPosition exchangePosition) {
        if (isExitAction(evaluation.kind()) && exchangePosition != null) {
            return exchangePosition.quantity();
        }
        if (evaluation.notional() == null) {
            throw new IllegalStateException("주문 명목금액이 없습니다");
        }
        return AutoTradeOrderQuantityCalculator.fromNotional(
                evaluation.notional(), referencePrice, symbolRulesClient.rules(config.symbol()));
    }

    private BigDecimal orderPrice(AutoTradeStrategyConfig config,
                                  AutoTradeEvaluation evaluation,
                                  AutoTradeBookTicker quote) {
        boolean entryOrAdd = evaluation.kind() == AutoTradeActionKind.ENTER
                || evaluation.kind() == AutoTradeActionKind.ADD;
        if (entryOrAdd) {
            return AutoTradeOrderPriceCalculator.makerEntryPrice(
                    evaluation.side(), quote, symbolRulesClient.rules(config.symbol()).priceTick());
        }
        return evaluation.kind() == AutoTradeActionKind.TAKE_PROFIT
                ? evaluation.triggerPrice() : null;
    }

    private AutoTradeOrderRequest request(AutoTradeStrategyConfig config,
                                          com.chs.springboot.domain.binance.autotrade.model.AutoTradeEvaluation evaluation,
                                          BigDecimal quantity,
                                          BigDecimal orderPrice) {
        boolean closing = isExitAction(evaluation.kind());
        AutoTradeSide positionSide = evaluation.side();
        AutoTradeOrderSide orderSide = closing
                ? positionSide == AutoTradeSide.LONG ? AutoTradeOrderSide.SELL : AutoTradeOrderSide.BUY
                : positionSide == AutoTradeSide.LONG ? AutoTradeOrderSide.BUY : AutoTradeOrderSide.SELL;
        boolean entryOrAdd = evaluation.kind() == AutoTradeActionKind.ENTER
                || evaluation.kind() == AutoTradeActionKind.ADD;
        boolean takeProfit = evaluation.kind() == AutoTradeActionKind.TAKE_PROFIT;
        AutoTradeOrderType type = entryOrAdd || takeProfit
                ? AutoTradeOrderType.LIMIT : AutoTradeOrderType.MARKET;
        AutoTradeOrderTimeInForce timeInForce = entryOrAdd
                ? AutoTradeOrderTimeInForce.GTX : AutoTradeOrderTimeInForce.GTC;
        return new AutoTradeOrderRequest(
                config.symbol(),
                evaluation.kind(),
                orderSide,
                type,
                AutoTradeOrderPositionSide.BOTH,
                quantity,
                orderPrice,
                null,
                timeInForce,
                closing,
                clientOrderId(evaluation.kind())
        );
    }

    private void applyPaperFill(String symbol,
                                BigDecimal price,
                                AutoTradeOrderRequest request,
                                BigDecimal quantity,
                                AutoTradePaperPosition current) {
        if (isExitAction(request.action())) {
            paperPositionStore.delete(symbol);
            return;
        }
        AutoTradeSide side = request.side() == AutoTradeOrderSide.BUY ? AutoTradeSide.LONG : AutoTradeSide.SHORT;
        if (current == null) {
            paperPositionStore.put(symbol, new AutoTradePaperPosition(side, quantity, price, 0));
            return;
        }
        BigDecimal totalQuantity = current.quantity().add(quantity);
        BigDecimal average = current.averageEntryPrice().multiply(current.quantity())
                .add(price.multiply(quantity)).divide(totalQuantity, 18, java.math.RoundingMode.HALF_UP);
        paperPositionStore.put(symbol, new AutoTradePaperPosition(
                current.side(), totalQuantity, average, current.addCount() + 1));
    }

    private AutoTradeExecutionResult reconcilePendingOrder(AutoTradeExecutionSettings settings,
                                                            AutoTradeStrategyConfig config,
                                                            AutoTradeFuturesAccountSnapshot account,
                                                            AutoTradePriceSnapshot price) {
        AutoTradePendingOrder pending = pendingOrderStore.get(config.symbol()).orElse(null);
        if (pending == null) {
            pending = recoverPendingOrder(config, account);
        }
        if (pending == null) {
            return null;
        }
        AutoTradePendingOrder resolvedPending = pending;
        boolean stillOpen = account.openOrders().stream()
                .anyMatch(order -> resolvedPending.clientOrderId().equals(order.clientOrderId()));
        if (stillOpen) {
            return result(settings.mode(), pending.action(), null, price,
                    "메이커 지정가 주문이 체결을 기다리고 있습니다");
        }
        AutoTradeFuturesOrder order;
        try {
            order = futuresClient.order(config.symbol(), pending.clientOrderId());
        } catch (RuntimeException e) {
            return result(settings.mode(), AutoTradeActionKind.NO_ACTION, null, price,
                    "지정가 주문 결과를 확인하지 못해 재주문을 보류합니다");
        }
        boolean filled = "FILLED".equalsIgnoreCase(order.status())
                || (order.executedQuantity().signum() > 0
                && ("CANCELED".equalsIgnoreCase(order.status())
                || "EXPIRED".equalsIgnoreCase(order.status())));
        if (filled) {
            if (account.positions().isEmpty() && pending.action() != AutoTradeActionKind.TAKE_PROFIT) {
                return result(settings.mode(), AutoTradeActionKind.NO_ACTION, null, price,
                        "지정가 체결 결과가 계정에 반영되기를 기다리고 있습니다");
            }
            AutoTradeFuturesPosition position = account.positions().isEmpty()
                    ? null : account.positions().get(0);
            applyLiveSubmission(config.symbol(), pending.action(), pending.side(), position);
            pendingOrderStore.delete(config.symbol());
            return null;
        }
        if ("CANCELED".equalsIgnoreCase(order.status())
                || "EXPIRED".equalsIgnoreCase(order.status())
                || "REJECTED".equalsIgnoreCase(order.status())) {
            pendingOrderStore.delete(config.symbol());
            if (pending.action() == AutoTradeActionKind.ENTER) {
                lastEntryAnalysisAtMs = 0L;
            }
            return null;
        }
        return result(settings.mode(), AutoTradeActionKind.NO_ACTION, null, price,
                "지정가 주문 상태를 확인할 수 없어 재주문을 보류합니다");
    }

    private AutoTradePendingOrder recoverPendingOrder(AutoTradeStrategyConfig config,
                                                      AutoTradeFuturesAccountSnapshot account) {
        return account.openOrders().stream()
                .filter(order -> order.clientOrderId().startsWith("at_"))
                .map(order -> pendingOrder(config, order))
                .filter(java.util.Objects::nonNull)
                .findFirst()
                .map(pending -> {
                    pendingOrderStore.set(pending);
                    return pending;
                })
                .orElse(null);
    }

    private AutoTradePendingOrder pendingOrder(AutoTradeStrategyConfig config,
                                               AutoTradeFuturesOrder order) {
        String[] parts = order.clientOrderId().split("_");
        if (parts.length < 2) {
            return null;
        }
        try {
            AutoTradeActionKind action = AutoTradeActionKind.valueOf(parts[1].toUpperCase());
            if (action != AutoTradeActionKind.ENTER
                    && action != AutoTradeActionKind.ADD
                    && action != AutoTradeActionKind.TAKE_PROFIT) {
                return null;
            }
            AutoTradeSide side = "BUY".equalsIgnoreCase(order.side())
                    ? AutoTradeSide.LONG : AutoTradeSide.SHORT;
            return new AutoTradePendingOrder(config.symbol(), action, side, order.clientOrderId());
        } catch (IllegalArgumentException e) {
            return null;
        }
    }

    private void applyLiveSubmission(String symbol,
                                     AutoTradeActionKind action,
                                     AutoTradeSide side,
                                     AutoTradeFuturesPosition current) {
        if (isExitAction(action)) {
            addCountStore.delete(symbol, current == null ? side : current.side());
        } else if (action == AutoTradeActionKind.ENTER) {
            addCountStore.set(symbol, side, 0);
        } else if (action == AutoTradeActionKind.ADD) {
            addCountStore.set(symbol, side, addCountStore.get(symbol, side) + 1);
        }
    }

    private AutoTradeFuturesAccountSnapshot account(AutoTradeExecutionSettings settings, String symbol) {
        long now = System.currentTimeMillis();
        if (cachedAccount != null && symbol.equals(cachedAccountSymbol)
                && now - cachedAccountAtMs < settings.accountRefreshIntervalMs()) {
            accountRefreshedOnLastRead = false;
            return cachedAccount;
        }
        try {
            AutoTradeFuturesAccountSnapshot account = futuresClient.snapshot(symbol);
            cachedAccount = account;
            cachedAccountSymbol = symbol;
            cachedAccountAtMs = now;
            accountRefreshedOnLastRead = true;
            return account;
        } catch (RuntimeException e) {
            accountRefreshedOnLastRead = false;
            log.warn("[AutoTrade] 계정 상태 갱신 실패: {}", e.getMessage());
            return null;
        }
    }

    private AutoTradeEntryDecision entryDecisionIfDue(AutoTradeExecutionSettings settings) {
        long now = System.currentTimeMillis();
        if (now - lastEntryAnalysisAtMs < settings.entryAnalysisIntervalMs()) {
            return AutoTradeEntryDecision.noTrade("진입 분석 대기 간격입니다");
        }
        lastEntryAnalysisAtMs = now;
        return entryDecisionService.decide();
    }

    private AutoTradeStrategyConfig currentStrategyConfig() {
        long now = System.currentTimeMillis();
        AutoTradeStrategyConfig current = cachedStrategyConfig;
        if (current != null && now - cachedStrategyConfigAtMs < 500L) {
            return current;
        }
        current = configService.current();
        cachedStrategyConfig = current;
        cachedStrategyConfigAtMs = now;
        return current;
    }

    private BigDecimal latestPrice() {
        return priceMonitor.latest().map(AutoTradePriceSnapshot::lastPrice).orElse(null);
    }

    private AutoTradePriceSnapshot latestSnapshot() {
        return priceMonitor.latest().orElse(null);
    }

    private boolean isExitAction(AutoTradeActionKind action) {
        return action == AutoTradeActionKind.TAKE_PROFIT || action == AutoTradeActionKind.STOP_LOSS;
    }

    private boolean isExecutableAction(AutoTradeActionKind action) {
        return action == AutoTradeActionKind.ENTER
                || action == AutoTradeActionKind.ADD
                || isExitAction(action);
    }

    private String clientOrderId(AutoTradeActionKind action) {
        return "at_" + action.name().toLowerCase() + "_" + System.currentTimeMillis()
                + "_" + orderSequence.incrementAndGet();
    }

    private AutoTradeOrderSubmission rejected(AutoTradeActionKind action, String message) {
        return new AutoTradeOrderSubmission(
                AutoTradeOrderSubmissionKind.REJECTED,
                action == null ? AutoTradeActionKind.NO_ACTION : action,
                null,
                null,
                message
        );
    }

    private AutoTradeExecutionResult result(AutoTradeExecutionMode mode,
                                            AutoTradeActionKind action,
                                            AutoTradeOrderSubmission submission,
                                            AutoTradePriceSnapshot price,
                                            String message) {
        return new AutoTradeExecutionResult(mode, action, submission,
                price == null ? null : price.lastPrice(), message);
    }

}
