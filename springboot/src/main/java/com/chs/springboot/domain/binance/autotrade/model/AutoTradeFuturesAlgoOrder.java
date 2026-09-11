package com.chs.springboot.domain.binance.autotrade.model;

import java.math.BigDecimal;

public record AutoTradeFuturesAlgoOrder(
        long algoId,
        String clientAlgoId,
        String symbol,
        String side,
        String positionSide,
        String orderType,
        String status,
        BigDecimal quantity,
        BigDecimal price,
        BigDecimal triggerPrice,
        boolean reduceOnly,
        boolean closePosition
) {

    public AutoTradeFuturesAlgoOrder(long algoId,
                                     String clientAlgoId,
                                     String symbol,
                                     String side,
                                     String positionSide,
                                     String orderType,
                                     String status,
                                     BigDecimal quantity,
                                     BigDecimal triggerPrice,
                                     boolean reduceOnly,
                                     boolean closePosition) {
        this(algoId, clientAlgoId, symbol, side, positionSide, orderType, status,
                quantity, BigDecimal.ZERO, triggerPrice, reduceOnly, closePosition);
    }
}
