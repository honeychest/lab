// Purpose: 클라이언트가 요청한 WebSocket 심볼 변경을 전달하는 이벤트

package com.chs.springboot.domain.binance.service;

import org.springframework.context.ApplicationEvent;

/**
 * 클라이언트가 `/ws/binance-price?symbol=...`으로 연결할 때마다
 * BinancePriceWebSocketHandler에서 발행하는 이벤트.
 *
 * BinaceStreamService는 이 이벤트를 구독하여 내부 심볼을 변경하고
 * WebSocket을 재연결한다. 이렇게 하면 Handler와 Service 간의 순환
 * 의존성을 피할 수 있다: Handler는 ApplicationEventPublisher에만
 * 의존하고, Service는 Handler를 전혀 참조하지 않는다.
 */
public class SymbolChangeEvent extends ApplicationEvent {
    private final String symbol;

    public SymbolChangeEvent(Object source, String symbol) {
        super(source);
        this.symbol = symbol;
    }

    public String getSymbol() {
        return symbol;
    }
}
