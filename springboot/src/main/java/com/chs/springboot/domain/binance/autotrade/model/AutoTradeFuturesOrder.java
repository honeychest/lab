package com.chs.springboot.domain.binance.autotrade.model;

import java.math.BigDecimal;

public record AutoTradeFuturesOrder(
        long orderId,
        String clientOrderId,
        String symbol,
        String side,
        String positionSide,
        String type,
        String status,
        BigDecimal price,
        BigDecimal stopPrice,
        BigDecimal quantity,
        BigDecimal executedQuantity,
        boolean reduceOnly,
        boolean closePosition
) {
}
