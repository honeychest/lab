package com.chs.springboot.domain.binance.autotrade.service;

import com.chs.springboot.domain.binance.autotrade.model.AutoTradeActionKind;
import com.chs.springboot.domain.binance.autotrade.model.AutoTradeEntryDecision;
import com.chs.springboot.domain.binance.autotrade.model.AutoTradeEvaluation;
import com.chs.springboot.domain.binance.autotrade.model.AutoTradePositionState;
import com.chs.springboot.domain.binance.autotrade.model.AutoTradePriceSnapshot;
import com.chs.springboot.domain.binance.autotrade.model.AutoTradeSide;
import com.chs.springboot.domain.binance.autotrade.model.AutoTradeStrategyConfig;
import com.chs.springboot.domain.binance.autotrade.strategy.OneWayPositionModeStrategy;
import com.chs.springboot.domain.binance.autotrade.strategy.PositionModeStrategy;
import com.chs.springboot.domain.binance.autotrade.strategy.PositionSizingStrategy;
import com.chs.springboot.domain.binance.autotrade.strategy.PriceSourceStrategy;

import java.math.BigDecimal;

public final class AutoTradeRuleEngine {

    private final PositionModeStrategy positionModeStrategy;
    private final PositionSizingStrategy positionSizingStrategy;
    private final PriceSourceStrategy priceSourceStrategy;

    public AutoTradeRuleEngine(PositionModeStrategy positionModeStrategy,
                               PositionSizingStrategy positionSizingStrategy,
                               PriceSourceStrategy priceSourceStrategy) {
        this.positionModeStrategy = positionModeStrategy;
        this.positionSizingStrategy = positionSizingStrategy;
        this.priceSourceStrategy = priceSourceStrategy;
    }

    public static AutoTradeRuleEngine oneWay(PositionSizingStrategy sizingStrategy,
                                             PriceSourceStrategy priceSourceStrategy) {
        return new AutoTradeRuleEngine(new OneWayPositionModeStrategy(), sizingStrategy, priceSourceStrategy);
    }

    public AutoTradeEvaluation evaluate(AutoTradePositionState position,
                                        AutoTradePriceSnapshot priceSnapshot,
                                        AutoTradeEntryDecision entryDecision,
                                        AutoTradeStrategyConfig config) {
        if (config.positionMode() != positionModeStrategy.mode()) {
            throw new IllegalStateException("현재 포지션 모드 전략이 설정과 다릅니다: " + config.positionMode());
        }
        if (config.priceSource() != priceSourceStrategy.source()) {
            throw new IllegalStateException("현재 가격 전략이 설정과 다릅니다: " + config.priceSource());
        }
        BigDecimal currentPrice = priceSourceStrategy.currentPrice(priceSnapshot);
        if (position == null) {
            return evaluateEntry(currentPrice, entryDecision, config);
        }
        return evaluatePosition(position, currentPrice, config);
    }

    private AutoTradeEvaluation evaluateEntry(BigDecimal currentPrice,
                                              AutoTradeEntryDecision entryDecision,
                                              AutoTradeStrategyConfig config) {
        if (entryDecision == null || entryDecision.side() == AutoTradeSide.NONE) {
            return AutoTradeEvaluation.noAction("진입 판단이 없어 대기합니다");
        }
        positionModeStrategy.validateEntry(AutoTradeSide.NONE, entryDecision.side());
        return new AutoTradeEvaluation(AutoTradeActionKind.ENTER, entryDecision.side(),
                positionSizingStrategy.initialNotional(config), currentPrice,
                entryDecision.reason());
    }

    private AutoTradeEvaluation evaluatePosition(AutoTradePositionState position,
                                                  BigDecimal currentPrice,
                                                  AutoTradeStrategyConfig config) {
        BigDecimal averageEntry = position.averageEntryPrice();
        BigDecimal takeProfitPrice = position.side() == AutoTradeSide.LONG
                ? averageEntry.multiply(BigDecimal.ONE.add(config.takeProfitPct()))
                : averageEntry.multiply(BigDecimal.ONE.subtract(config.takeProfitPct()));
        BigDecimal stopLossPrice = position.side() == AutoTradeSide.LONG
                ? averageEntry.multiply(BigDecimal.ONE.subtract(config.stopLossPct()))
                : averageEntry.multiply(BigDecimal.ONE.add(config.stopLossPct()));
        if (isTakeProfit(position.side(), currentPrice, takeProfitPrice)) {
            return new AutoTradeEvaluation(AutoTradeActionKind.TAKE_PROFIT, position.side(),
                    position.positionNotional(), takeProfitPrice, "평균 진입가 기준 익절 조건");
        }
        if (isStopLoss(position.side(), currentPrice, stopLossPrice)) {
            return new AutoTradeEvaluation(AutoTradeActionKind.STOP_LOSS, position.side(),
                    position.positionNotional(), stopLossPrice, "평균 진입가 기준 손절 조건");
        }

        BigDecimal addPrice = position.side() == AutoTradeSide.LONG
                ? averageEntry.multiply(BigDecimal.ONE.subtract(config.addStepPct()))
                : averageEntry.multiply(BigDecimal.ONE.add(config.addStepPct()));
        if (!isAddTrigger(position.side(), currentPrice, addPrice)) {
            return AutoTradeEvaluation.noAction("추가 진입 조건이 없습니다");
        }
        if (position.addCount() >= config.maxAdds()) {
            return new AutoTradeEvaluation(AutoTradeActionKind.ADD_LIMIT_REACHED, position.side(),
                    null, addPrice, "최대 추가 진입 횟수에 도달했습니다");
        }
        return new AutoTradeEvaluation(AutoTradeActionKind.ADD, position.side(),
                positionSizingStrategy.nextAddNotional(position, config), addPrice,
                "평균 진입가 대비 추가 진입 조건");
    }

    private boolean isTakeProfit(AutoTradeSide side, BigDecimal currentPrice, BigDecimal takeProfitPrice) {
        return side == AutoTradeSide.LONG
                ? currentPrice.compareTo(takeProfitPrice) >= 0
                : currentPrice.compareTo(takeProfitPrice) <= 0;
    }

    private boolean isStopLoss(AutoTradeSide side, BigDecimal currentPrice, BigDecimal stopLossPrice) {
        return side == AutoTradeSide.LONG
                ? currentPrice.compareTo(stopLossPrice) <= 0
                : currentPrice.compareTo(stopLossPrice) >= 0;
    }

    private boolean isAddTrigger(AutoTradeSide side, BigDecimal currentPrice, BigDecimal addPrice) {
        return side == AutoTradeSide.LONG
                ? currentPrice.compareTo(addPrice) <= 0
                : currentPrice.compareTo(addPrice) >= 0;
    }
}
