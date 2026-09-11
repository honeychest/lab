package com.chs.springboot.domain.binance.autotrade.model;

public enum AutoTradeOrderSubmissionKind {
    SKIPPED,
    PAPER_ACCEPTED,
    TEST_ACCEPTED,
    LIVE_ACCEPTED,
    REJECTED,
    UNKNOWN
}
