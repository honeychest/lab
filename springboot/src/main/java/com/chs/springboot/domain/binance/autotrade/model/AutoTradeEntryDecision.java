package com.chs.springboot.domain.binance.autotrade.model;

public record AutoTradeEntryDecision(AutoTradeSide side, String reason) {

    public AutoTradeEntryDecision {
        side = side == null ? AutoTradeSide.NONE : side;
        reason = reason == null ? "" : reason;
    }

    public static AutoTradeEntryDecision noTrade(String reason) {
        return new AutoTradeEntryDecision(AutoTradeSide.NONE, reason);
    }
}
