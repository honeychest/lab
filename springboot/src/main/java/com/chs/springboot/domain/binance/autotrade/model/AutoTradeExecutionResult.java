package com.chs.springboot.domain.binance.autotrade.model;

import java.math.BigDecimal;

public record AutoTradeExecutionResult(
        AutoTradeExecutionMode mode,
        AutoTradeActionKind action,
        AutoTradeOrderSubmission submission,
        BigDecimal price,
        String message
) {
}
