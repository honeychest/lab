package com.chs.springboot.domain.binance.autotrade.model;

import java.math.BigDecimal;

public record AutoTradeOrderRequest(
        String symbol,
        AutoTradeActionKind action,
        AutoTradeOrderSide side,
        AutoTradeOrderType type,
        AutoTradeOrderPositionSide positionSide,
        BigDecimal quantity,
        BigDecimal price,
        BigDecimal stopPrice,
        AutoTradeOrderTimeInForce timeInForce,
        boolean reduceOnly,
        String clientOrderId
) {

    public AutoTradeOrderRequest(String symbol,
                                 AutoTradeActionKind action,
                                 AutoTradeOrderSide side,
                                 AutoTradeOrderType type,
                                 AutoTradeOrderPositionSide positionSide,
                                 BigDecimal quantity,
                                 BigDecimal stopPrice,
                                 boolean reduceOnly,
                                 String clientOrderId) {
        this(symbol, action, side, type, positionSide, quantity, null, stopPrice,
                AutoTradeOrderTimeInForce.GTC, reduceOnly, clientOrderId);
    }

    public AutoTradeOrderRequest {
        if (symbol == null || symbol.isBlank()) {
            throw new IllegalArgumentException("주문 심볼은 비어 있을 수 없습니다");
        }
        symbol = symbol.trim().toUpperCase();
        if (action == null || action == AutoTradeActionKind.NO_ACTION
                || action == AutoTradeActionKind.ADD_LIMIT_REACHED) {
            throw new IllegalArgumentException("실행할 주문 종류가 필요합니다");
        }
        if (side == null || type == null || positionSide == null) {
            throw new IllegalArgumentException("주문 방향과 종류가 필요합니다");
        }
        if (quantity == null || quantity.signum() <= 0) {
            throw new IllegalArgumentException("주문 수량은 0보다 커야 합니다");
        }
        if ((type == AutoTradeOrderType.LIMIT
                || type == AutoTradeOrderType.STOP
                || type == AutoTradeOrderType.TAKE_PROFIT)
                && (price == null || price.signum() <= 0)) {
            throw new IllegalArgumentException("지정가 주문에는 주문 가격이 필요합니다");
        }
        if ((type == AutoTradeOrderType.STOP_MARKET || type == AutoTradeOrderType.TAKE_PROFIT_MARKET)
                && (stopPrice == null || stopPrice.signum() <= 0)) {
            throw new IllegalArgumentException("조건부 주문에는 발동 가격이 필요합니다");
        }
        if ((type == AutoTradeOrderType.STOP || type == AutoTradeOrderType.TAKE_PROFIT)
                && (stopPrice == null || stopPrice.signum() <= 0)) {
            throw new IllegalArgumentException("조건부 지정가 주문에는 발동 가격이 필요합니다");
        }
        timeInForce = timeInForce == null ? AutoTradeOrderTimeInForce.GTC : timeInForce;
        if (clientOrderId == null || clientOrderId.isBlank()) {
            throw new IllegalArgumentException("주문 식별자가 필요합니다");
        }
    }
}
