// Purpose: WebSocket 엔드포인트 등록 — /ws/binance-price 경로로 핸들러 연결
package com.chs.springboot.global.websocket;

import com.chs.springboot.domain.binance.websocket.BinancePriceWebSocketHandler;
import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.socket.config.annotation.EnableWebSocket;
import org.springframework.web.socket.config.annotation.WebSocketConfigurer;
import org.springframework.web.socket.config.annotation.WebSocketHandlerRegistry;

@Configuration
@EnableWebSocket
@RequiredArgsConstructor
public class WebSocketConfig implements WebSocketConfigurer {

    private final BinancePriceWebSocketHandler handler;

    @Override
    public void registerWebSocketHandlers(WebSocketHandlerRegistry registry) {
        registry.addHandler(handler, "/ws/binance-price")
                .setAllowedOrigins("*");
    }
}
