package com.chs.springboot.domain.binance.service;

public interface AggTradeSink {
    void accept(AggTradeEvent event);
}
