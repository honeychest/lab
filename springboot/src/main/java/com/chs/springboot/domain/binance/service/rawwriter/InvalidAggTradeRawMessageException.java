package com.chs.springboot.domain.binance.service.rawwriter;

public class InvalidAggTradeRawMessageException extends RuntimeException {

    public InvalidAggTradeRawMessageException(String message) {
        super(message);
    }

    public InvalidAggTradeRawMessageException(String message, Throwable cause) {
        super(message, cause);
    }
}

