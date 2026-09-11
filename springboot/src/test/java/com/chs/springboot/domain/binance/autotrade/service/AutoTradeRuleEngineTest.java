package com.chs.springboot.domain.binance.autotrade.service;

import com.chs.springboot.domain.binance.autotrade.model.AutoTradeActionKind;
import com.chs.springboot.domain.binance.autotrade.model.AutoTradeEntryDecision;
import com.chs.springboot.domain.binance.autotrade.model.AutoTradeEvaluation;
import com.chs.springboot.domain.binance.autotrade.model.AutoTradePositionState;
import com.chs.springboot.domain.binance.autotrade.model.AutoTradePriceSnapshot;
import com.chs.springboot.domain.binance.autotrade.model.AutoTradeSide;
import com.chs.springboot.domain.binance.autotrade.model.AutoTradeStrategyConfig;
import com.chs.springboot.domain.binance.autotrade.strategy.LastPriceStrategy;
import com.chs.springboot.domain.binance.autotrade.strategy.MartingalePositionSizingStrategy;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;

import static org.assertj.core.api.Assertions.assertThat;

class AutoTradeRuleEngineTest {

    private final AutoTradeRuleEngine engine = AutoTradeRuleEngine.oneWay(
            new MartingalePositionSizingStrategy(), new LastPriceStrategy());
    private final AutoTradeStrategyConfig config = AutoTradeStrategyConfig.testDefaults();

    @Test
    void entersWithConfiguredBaseNotionalWhenThereIsNoPosition() {
        AutoTradeEvaluation evaluation = engine.evaluate(
                null,
                price("100"),
                new AutoTradeEntryDecision(AutoTradeSide.LONG, "4h·1d 분석 승인"),
                config);

        assertThat(evaluation.kind()).isEqualTo(AutoTradeActionKind.ENTER);
        assertThat(evaluation.side()).isEqualTo(AutoTradeSide.LONG);
        assertThat(evaluation.notional()).isEqualByComparingTo("5");
    }

    @Test
    void martingaleAddsUseOneOneTwoFourNotionalSequence() {
        AutoTradeEvaluation firstAdd = engine.evaluate(
                position("100", "5", 0), price("99"), noTrade(), config);
        AutoTradeEvaluation secondAdd = engine.evaluate(
                position("99.5", "10", 1), price("98.505"), noTrade(), config);
        AutoTradeEvaluation thirdAdd = engine.evaluate(
                position("99.0025", "20", 2), price("98.012475"), noTrade(), config);

        assertThat(firstAdd.kind()).isEqualTo(AutoTradeActionKind.ADD);
        assertThat(firstAdd.notional()).isEqualByComparingTo("5");
        assertThat(secondAdd.kind()).isEqualTo(AutoTradeActionKind.ADD);
        assertThat(secondAdd.notional()).isEqualByComparingTo("10");
        assertThat(thirdAdd.kind()).isEqualTo(AutoTradeActionKind.ADD);
        assertThat(thirdAdd.notional()).isEqualByComparingTo("20");
    }

    @Test
    void blocksTheFourthAddWhenMaxAddsIsThree() {
        AutoTradeEvaluation evaluation = engine.evaluate(
                position("100", "40", 3), price("99"), noTrade(), config);

        assertThat(evaluation.kind()).isEqualTo(AutoTradeActionKind.ADD_LIMIT_REACHED);
        assertThat(evaluation.notional()).isNull();
    }

    @Test
    void takesProfitAndStopsLongAtTwoPercentFromAverageEntry() {
        AutoTradeEvaluation takeProfit = engine.evaluate(
                position("100", "5", 0), price("102"), noTrade(), config);
        AutoTradeEvaluation stopLoss = engine.evaluate(
                position("100", "5", 0), price("98"), noTrade(), config);

        assertThat(takeProfit.kind()).isEqualTo(AutoTradeActionKind.TAKE_PROFIT);
        assertThat(stopLoss.kind()).isEqualTo(AutoTradeActionKind.STOP_LOSS);
    }

    @Test
    void appliesTheOppositeRulesToShortPositions() {
        AutoTradeEvaluation add = engine.evaluate(
                new AutoTradePositionState(AutoTradeSide.SHORT, decimal("100"), decimal("5"), 0),
                price("101"), noTrade(), config);
        AutoTradeEvaluation takeProfit = engine.evaluate(
                new AutoTradePositionState(AutoTradeSide.SHORT, decimal("100"), decimal("5"), 0),
                price("98"), noTrade(), config);
        AutoTradeEvaluation stopLoss = engine.evaluate(
                new AutoTradePositionState(AutoTradeSide.SHORT, decimal("100"), decimal("5"), 0),
                price("102"), noTrade(), config);

        assertThat(add.kind()).isEqualTo(AutoTradeActionKind.ADD);
        assertThat(add.notional()).isEqualByComparingTo("5");
        assertThat(takeProfit.kind()).isEqualTo(AutoTradeActionKind.TAKE_PROFIT);
        assertThat(stopLoss.kind()).isEqualTo(AutoTradeActionKind.STOP_LOSS);
    }

    private AutoTradePositionState position(String averageEntryPrice, String positionNotional, int addCount) {
        return new AutoTradePositionState(AutoTradeSide.LONG,
                decimal(averageEntryPrice), decimal(positionNotional), addCount);
    }

    private AutoTradePriceSnapshot price(String lastPrice) {
        return new AutoTradePriceSnapshot(decimal(lastPrice), null);
    }

    private AutoTradeEntryDecision noTrade() {
        return AutoTradeEntryDecision.noTrade("테스트 대기");
    }

    private BigDecimal decimal(String value) {
        return new BigDecimal(value);
    }
}
