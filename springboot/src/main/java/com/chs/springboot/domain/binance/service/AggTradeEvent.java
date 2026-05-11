package com.chs.springboot.domain.binance.service;

public record AggTradeEvent(
        String symbol,
        String marketType,
        long receivedAt,
        String rawJson,
        AggTradeFields parsed
) {
    public boolean hasParsed() {
        return parsed != null;
    }

    public record AggTradeFields(
            long aggId,
            String price,
            String quantity,
            boolean isBuyerMaker,
            long tradedAt
    ) {
    }
}
