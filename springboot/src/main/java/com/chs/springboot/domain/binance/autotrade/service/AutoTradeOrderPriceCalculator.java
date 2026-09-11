package com.chs.springboot.domain.binance.autotrade.service;

import com.chs.springboot.domain.binance.autotrade.model.AutoTradeSide;
import com.chs.springboot.domain.binance.autotrade.model.AutoTradeBookTicker;

import java.math.BigDecimal;
import java.math.RoundingMode;

public final class AutoTradeOrderPriceCalculator {

    private AutoTradeOrderPriceCalculator() {
    }

    public static BigDecimal takeProfit(AutoTradeSide side,
                                        BigDecimal averageEntryPrice,
                                        BigDecimal percentage,
                                        BigDecimal tickSize) {
        BigDecimal raw = side == AutoTradeSide.LONG
                ? averageEntryPrice.multiply(BigDecimal.ONE.add(percentage))
                : averageEntryPrice.multiply(BigDecimal.ONE.subtract(percentage));
        return align(raw, tickSize, side == AutoTradeSide.LONG ? RoundingMode.DOWN : RoundingMode.UP);
    }

    public static BigDecimal stopLoss(AutoTradeSide side,
                                      BigDecimal averageEntryPrice,
                                      BigDecimal percentage,
                                      BigDecimal tickSize) {
        BigDecimal raw = side == AutoTradeSide.LONG
                ? averageEntryPrice.multiply(BigDecimal.ONE.subtract(percentage))
                : averageEntryPrice.multiply(BigDecimal.ONE.add(percentage));
        return align(raw, tickSize, side == AutoTradeSide.LONG ? RoundingMode.UP : RoundingMode.DOWN);
    }

    public static BigDecimal makerEntryPrice(AutoTradeSide side,
                                             AutoTradeBookTicker ticker,
                                             BigDecimal tickSize) {
        BigDecimal raw = side == AutoTradeSide.LONG ? ticker.bestBid() : ticker.bestAsk();
        return align(raw, tickSize, side == AutoTradeSide.LONG ? RoundingMode.DOWN : RoundingMode.UP);
    }

    private static BigDecimal align(BigDecimal price, BigDecimal tickSize, RoundingMode mode) {
        BigDecimal units = price.divide(tickSize, 0, mode);
        return units.multiply(tickSize).stripTrailingZeros();
    }
}
