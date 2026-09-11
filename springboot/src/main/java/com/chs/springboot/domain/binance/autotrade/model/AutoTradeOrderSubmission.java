package com.chs.springboot.domain.binance.autotrade.model;

public record AutoTradeOrderSubmission(
        AutoTradeOrderSubmissionKind kind,
        AutoTradeActionKind action,
        String clientOrderId,
        Long orderId,
        String message
) {

    public boolean accepted() {
        return kind == AutoTradeOrderSubmissionKind.PAPER_ACCEPTED
                || kind == AutoTradeOrderSubmissionKind.TEST_ACCEPTED
                || kind == AutoTradeOrderSubmissionKind.LIVE_ACCEPTED;
    }
}
