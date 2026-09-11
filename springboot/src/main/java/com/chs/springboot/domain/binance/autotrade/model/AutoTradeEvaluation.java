package com.chs.springboot.domain.binance.autotrade.model;

import java.math.BigDecimal;

public record AutoTradeEvaluation(
        AutoTradeActionKind kind,
        AutoTradeSide side,
        BigDecimal notional,
        BigDecimal triggerPrice,
        String reason
) {

    public AutoTradeEvaluation {
        kind = kind == null ? AutoTradeActionKind.NO_ACTION : kind;
        side = side == null ? AutoTradeSide.NONE : side;
        reason = reason == null ? "" : reason;
    }

    public static AutoTradeEvaluation noAction(String reason) {
        return new AutoTradeEvaluation(AutoTradeActionKind.NO_ACTION, AutoTradeSide.NONE,
                null, null, reason);
    }
}
