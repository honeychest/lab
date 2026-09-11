package com.chs.springboot.domain.binance.autotrade.model;

import java.math.BigDecimal;

public record AutoTradeFuturesPosition(
        String symbol,
        AutoTradeSide side,
        BigDecimal quantity,
        BigDecimal entryPrice,
        BigDecimal unrealizedProfit,
        int leverage,
        boolean isolated
) {
}
