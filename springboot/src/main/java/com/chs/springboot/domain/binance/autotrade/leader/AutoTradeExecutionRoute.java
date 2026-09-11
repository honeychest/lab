package com.chs.springboot.domain.binance.autotrade.leader;

public record AutoTradeExecutionRoute(AutoTradeExecutionRouteKind kind, String leaderName, String reason) {

    public AutoTradeExecutionRoute {
        kind = kind == null ? AutoTradeExecutionRouteKind.UNAVAILABLE : kind;
        leaderName = leaderName == null ? "" : leaderName;
        reason = reason == null ? "" : reason;
    }
}
