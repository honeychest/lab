package com.chs.springboot.domain.binance.service.rawwriter;

/**
 * DB에서 조회한 특정 윈도우 구간의 집계 통계 (DryRun 비교용).
 */
public record AggTradeRawWriterDbWindowStats(
        int count,           // 윈도우 내 DB 저장 건수
        Long minAggTradeId,  // 윈도우 내 최소 aggTradeId
        Long maxAggTradeId,  // 윈도우 내 최대 aggTradeId
        Long minTradedAt,    // 윈도우 내 최소 체결시각(ms)
        Long maxTradedAt     // 윈도우 내 최대 체결시각(ms)
) {
    public static AggTradeRawWriterDbWindowStats empty() {
        return new AggTradeRawWriterDbWindowStats(0, null, null, null, null);
    }
}

