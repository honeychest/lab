// [AGENT] 역할: 5분봉 완성 Spring 이벤트 | 발행: AggTradeRollupService.rollup5m() | 수신: CandleStreamService
package com.chs.springboot.domain.binance.model.event;

import com.chs.springboot.domain.binance.model.AggTrade5m;
import org.springframework.context.ApplicationEvent;

public class CandleCompletedEvent extends ApplicationEvent {

    private final AggTrade5m candle;

    public CandleCompletedEvent(Object source, AggTrade5m candle) {
        super(source);
        this.candle = candle;
    }

    public AggTrade5m getCandle() {
        return candle;
    }
}
