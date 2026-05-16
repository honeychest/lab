package com.chs.springboot.domain.binance.service.rawwriter;

import java.util.List;

/**
 * 10초 윈도우 단위로 Kafka 수신 건수와 DB 저장 건수를 비교한 결과.
 * {@code comparisonStatus}: OK(일치) / CHECK(불일치) / PARTIAL(윈도우 경계 걸침).
 */
public record AggTradeRawWriterDryRunSummary(
        String id,                        // 요약 고유 UUID
        long windowStartMs,               // 윈도우 시작 (ms, 10초 단위 정렬)
        long windowEndMs,                 // 윈도우 종료 (windowStart + 10_000)
        String symbol,                    // 거래 심볼
        String marketType,                // 시장 유형
        int kafkaCount,                   // 윈도우 내 Kafka 수신 건수
        int dbCount,                      // 윈도우 내 DB 저장 건수
        Long kafkaMinAggTradeId,          // Kafka 최소 aggTradeId
        Long kafkaMaxAggTradeId,          // Kafka 최대 aggTradeId
        Long dbMinAggTradeId,             // DB 최소 aggTradeId
        Long dbMaxAggTradeId,             // DB 최대 aggTradeId
        Long kafkaMinTradedAt,            // Kafka 최소 체결시각(ms)
        Long kafkaMaxTradedAt,            // Kafka 최대 체결시각(ms)
        Long dbMinTradedAt,               // DB 최소 체결시각(ms)
        Long dbMaxTradedAt,               // DB 최대 체결시각(ms)
        int invalidCount,                 // 파싱 실패 등 무효 건수
        List<Long> sampleAggTradeIds,     // 대표 샘플 aggTradeId 목록 (최대 8건)
        boolean countMatched,             // Kafka·DB 건수 일치 여부
        boolean rangeMatched,             // aggTradeId 범위 일치 여부
        boolean partialWindow,            // 서비스 시작 시점에 걸친 불완전 윈도우 여부
        String comparisonStatus           // OK / CHECK / PARTIAL
) {
}
