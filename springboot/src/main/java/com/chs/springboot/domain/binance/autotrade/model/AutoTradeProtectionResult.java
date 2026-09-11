package com.chs.springboot.domain.binance.autotrade.model;

public record AutoTradeProtectionResult(
        AutoTradeProtectionKind kind,
        String message
) {

    public boolean canTrade() {
        return kind == AutoTradeProtectionKind.READY
                || kind == AutoTradeProtectionKind.NOT_REQUIRED;
    }
}
