package com.chs.springboot.domain.binance.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.util.HashMap;
import java.util.Map;

@Component
public class AggTradeSseSink implements AggTradeSink {

    private static final Logger log = LoggerFactory.getLogger(AggTradeSseSink.class);

    private final SignalSseService signalSseService;

    public AggTradeSseSink(SignalSseService signalSseService) {
        this.signalSseService = signalSseService;
    }

    @Override
    public void accept(AggTradeEvent event) {
        if (!event.hasParsed()) {
            return;
        }
        try {
            AggTradeEvent.AggTradeFields f = event.parsed();
            Map<String, Object> dto = new HashMap<>();
            dto.put("symbol", event.symbol());
            dto.put("marketType", event.marketType());
            dto.put("price", f.price());
            dto.put("quantity", f.quantity());
            dto.put("isBuyerMaker", f.isBuyerMaker());
            dto.put("tradedAt", f.tradedAt());
            signalSseService.broadcastAggTrade(dto);
        } catch (Exception e) {
            log.error("[AggTradeSseSink] broadcast 실패 {} {} error={}",
                    event.symbol(), event.marketType(), e.getMessage());
        }
    }
}
