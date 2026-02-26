// Purpose: 프론트엔드 WebSocket 세션 관리 — 연결/해제 처리 및 시세 브로드캐스트
package com.chs.springboot.domain.binance.websocket;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.TextWebSocketHandler;

import java.util.concurrent.ConcurrentHashMap;

@Component
public class BinancePriceWebSocketHandler extends TextWebSocketHandler {

    private static final Logger log = LoggerFactory.getLogger(BinancePriceWebSocketHandler.class);
    private final ConcurrentHashMap<String, WebSocketSession> sessions = new ConcurrentHashMap<>();

    @Override
    public void afterConnectionEstablished(WebSocketSession session) {
        sessions.put(session.getId(), session);
        log.info("[WS] 클라이언트 연결: {} (총 {}개)", session.getId(), sessions.size());
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
        sessions.remove(session.getId());
        log.info("[WS] 클라이언트 해제: {} (총 {}개)", session.getId(), sessions.size());
    }

    @Override
    public void handleTransportError(WebSocketSession session, Throwable exception) {
        log.error("[WS] 전송 오류 ({}): {}", session.getId(), exception.getMessage());
        sessions.remove(session.getId());
        try { session.close(); } catch (Exception e) { /* ignore */ }
    }

    // 연결된 모든 프론트엔드 클라이언트에게 시세 JSON 전송
    public void broadcastPrice(String json) {
        sessions.forEach((id, session) -> {
            try {
                if (session.isOpen()) {
                    session.sendMessage(new TextMessage(json));
                } else {
                    sessions.remove(id);
                }
            } catch (Exception e) {
                log.error("[WS] 메시지 전송 실패 ({}): {}", id, e.getMessage());
                sessions.remove(id);
            }
        });
    }

    public int getSessionCount() {
        return sessions.size();
    }
}
