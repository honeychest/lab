package com.chs.springboot.domain.binance.autotrade.model;

public record AutoTradeReconciliation(AutoTradeReconciliationKind kind,
                                      AutoTradeFuturesAccountSnapshot account,
                                      String message) {
}
