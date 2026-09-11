package com.chs.springboot.domain.binance.autotrade.model;

public record AutoTradePendingOrder(
        String symbol,
        AutoTradeActionKind action,
        AutoTradeSide side,
        String clientOrderId
) {

    public AutoTradePendingOrder {
        if (symbol == null || symbol.isBlank()) {
            throw new IllegalArgumentException("대기 주문 심볼은 비어 있을 수 없습니다");
        }
        symbol = symbol.trim().toUpperCase();
        if (action != AutoTradeActionKind.ENTER
                && action != AutoTradeActionKind.ADD
                && action != AutoTradeActionKind.TAKE_PROFIT) {
            throw new IllegalArgumentException("대기 주문은 진입·추가 진입·익절이어야 합니다");
        }
        if (side == null) {
            throw new IllegalArgumentException("대기 주문 방향이 필요합니다");
        }
        if (clientOrderId == null || clientOrderId.isBlank()) {
            throw new IllegalArgumentException("대기 주문 식별자가 필요합니다");
        }
    }
}
