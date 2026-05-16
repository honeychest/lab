package com.chs.springboot.domain.binance.service.rawwriter;

/**
 * Kafka 컨슈머에서 서비스 계층으로 전달하는 메시지 DTO.
 */
public record AggTradeRawWriterMessage(
        String topic,      // Kafka 토픽명
        Integer partition, // 파티션 번호
        Long offset,       // 파티션 내 오프셋
        String key,        // 메시지 키
        String value       // 메시지 페이로드 (JSON)
) {
}

