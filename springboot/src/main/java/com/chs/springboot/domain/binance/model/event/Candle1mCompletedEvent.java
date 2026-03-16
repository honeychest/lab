// [AGENT] 역할: 1분봉 완성 Spring 이벤트 | 발행: AggTradeRollupService.rollup1m() | 수신: CandleStreamService
package com.chs.springboot.domain.binance.model.event;

import com.chs.springboot.domain.binance.model.AggTrade1m;
import org.springframework.context.ApplicationEvent;

public class Candle1mCompletedEvent extends ApplicationEvent {

    private final AggTrade1m candle;

    public Candle1mCompletedEvent(Object source, AggTrade1m candle) {
        super(source);
        this.candle = candle;
    }

    public AggTrade1m getCandle() {
        return candle;
    }
}
