package com.chs.springboot.domain.binance.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

@Component
public class AggTradeDebugSink implements AggTradeSink {

    private static final Logger log = LoggerFactory.getLogger(AggTradeDebugSink.class);

    @Override
    public void accept(AggTradeEvent event) {
        if (!"ENAUSDT".equals(event.symbol()) || !"FUTURES".equals(event.marketType())) {
            return;
        }
        if (!event.hasParsed()) {
            return;
        }
        log.debug("[AggTradeStreamDebug] RECV ENAUSDT FUTURES aggId={}", event.parsed().aggId());
    }
}
