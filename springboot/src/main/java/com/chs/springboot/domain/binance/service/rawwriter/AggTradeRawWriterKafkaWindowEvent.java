package com.chs.springboot.domain.binance.service.rawwriter;

/**
 * Kafka 메시지 한 건을 DryRunVerifier 누적 버퍼로 전달하는 이벤트 DTO.
 * 컨슈머가 메시지를 처리할 때마다 생성하여 {@code accumulate()}에 넘긴다.
 */
public record AggTradeRawWriterKafkaWindowEvent(
        String symbol,      // 거래 심볼 (예: BTCUSDT)
        String marketType,  // 시장 유형 (예: SPOT)
        long tradedAt,      // 체결시각 (ms) — 윈도우 구간 산출 기준
        long aggTradeId,    // Binance aggTradeId
        int invalidCount    // 파싱 실패 등 무효 건수
) {
}

