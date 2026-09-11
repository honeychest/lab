package com.chs.springboot.domain.binance.autotrade.model;

import java.math.BigDecimal;
import java.util.List;

public record AutoTradeFuturesAccountSnapshot(
        BigDecimal availableBalance,
        BigDecimal totalWalletBalance,
        List<AutoTradeFuturesPosition> positions,
        List<AutoTradeFuturesOrder> openOrders
) {

    public AutoTradeFuturesAccountSnapshot {
        positions = positions == null ? List.of() : List.copyOf(positions);
        openOrders = openOrders == null ? List.of() : List.copyOf(openOrders);
    }
}
