// [AGENT] /ws/monitor 브로드캐스트 핸들러 (서버→클라이언트 단방향)
package com.chs.springboot.global.monitor.handler;

import com.chs.springboot.global.monitor.dto.MetricSnapshot;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.TextWebSocketHandler;

import java.util.concurrent.CopyOnWriteArrayList;

@Slf4j
@Component
@RequiredArgsConstructor
public class MonitorWebSocketHandler extends TextWebSocketHandler {

    private final CopyOnWriteArrayList<WebSocketSession> sessions = new CopyOnWriteArrayList<>();
    /**
     * Spring Boot가 기본 설정한 ObjectMapper를 사용해야 LocalDateTime(jsr310)이 직렬화된다.
     */
    private final ObjectMapper objectMapper;

    @Override
    public void afterConnectionEstablished(WebSocketSession session) {
        sessions.add(session);
        log.info("[MonitorWS] connected: {}, total={}", session.getId(), sessions.size());
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
        sessions.remove(session);
        log.info("[MonitorWS] closed: {}, total={}", session.getId(), sessions.size());
    }

    @Override
    public void handleTransportError(WebSocketSession session, Throwable exception) {
        sessions.remove(session);
        try {
            session.close();
        } catch (Exception ignored) {
        }
        log.warn("[MonitorWS] transport error: {}", exception.getMessage());
    }

    public void broadcast(MetricSnapshot snapshot) {
        String json;
        try {
            json = objectMapper.writeValueAsString(snapshot);
        } catch (Exception e) {
            log.warn("[MonitorWS] serialize failed: {}", e.getMessage());
            return;
        }

        for (WebSocketSession session : sessions) {
            try {
                if (session.isOpen()) {
                    session.sendMessage(new TextMessage(json));
                } else {
                    sessions.remove(session);
                }
            } catch (Exception e) {
                sessions.remove(session);
            }
        }
    }

    public int getSessionCount() {
        return sessions.size();
    }
}

