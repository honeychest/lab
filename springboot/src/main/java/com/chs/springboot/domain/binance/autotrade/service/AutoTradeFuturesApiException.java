package com.chs.springboot.domain.binance.autotrade.service;

public class AutoTradeFuturesApiException extends RuntimeException {

    private final int statusCode;
    private final boolean outcomeUnknown;

    public AutoTradeFuturesApiException(String message, int statusCode, boolean outcomeUnknown) {
        super(message);
        this.statusCode = statusCode;
        this.outcomeUnknown = outcomeUnknown;
    }

    public AutoTradeFuturesApiException(String message, Throwable cause, int statusCode, boolean outcomeUnknown) {
        super(message, cause);
        this.statusCode = statusCode;
        this.outcomeUnknown = outcomeUnknown;
    }

    public int statusCode() {
        return statusCode;
    }

    public boolean outcomeUnknown() {
        return outcomeUnknown;
    }
}
