package com.chs.springboot.domain.binance.service.rawwriter;

/**
 * Kafka 메시지 파싱 실패 시 던지는 unchecked 예외.
 * 컨슈머에서 이 예외를 잡아 DLQ 분기 처리한다.
 */
public class InvalidAggTradeRawMessageException extends RuntimeException {

    public InvalidAggTradeRawMessageException(String message) {
        super(message);
    }

    public InvalidAggTradeRawMessageException(String message, Throwable cause) {
        super(message, cause);
    }
}

