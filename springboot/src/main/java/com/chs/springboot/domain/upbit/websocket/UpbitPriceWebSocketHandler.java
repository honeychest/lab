// [AGENT] 역할: 프론트엔드 업비트 WS 세션 관리 및 시세 브로드캐스트 허브 | 연관파일: UpbitStreamService.java(broadcastPrice 호출자), UpbitSubscriptionChangeEvent.java, WebSocketConfig.java | 주요메서드: afterConnectionEstablished(), afterConnectionClosed(), broadcastPrice(), getAllRequestedCodesSnapshot(), parseRequestedCodes() | sessionCodes로 세션별 코드 관리, 세션 변동 시 합집합 이벤트 발행
// Purpose: 프론트엔드 업비트 WebSocket 세션 관리 및 업비트 시세 브로드캐스트

package com.chs.springboot.domain.upbit.websocket;

import com.chs.springboot.domain.upbit.service.UpbitSubscriptionChangeEvent;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.ConcurrentWebSocketSessionDecorator;
import org.springframework.web.socket.handler.TextWebSocketHandler;

import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
import java.util.LinkedHashSet;
import java.util.Locale;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 역할:
 * 1) 브라우저의 /ws/upbit-price 연결 세션 등록/해제
 * 2) 세션별 요청 코드(codes 쿼리 파라미터) 저장
 * 3) 전체 세션의 코드 합집합 변경 시 이벤트 발행
 * 4) UpbitStreamService가 전달한 원본 업비트 JSON을 전체 세션에 브로드캐스트
 */
@Component
public class UpbitPriceWebSocketHandler extends TextWebSocketHandler {

    private static final Logger log = LoggerFactory.getLogger(UpbitPriceWebSocketHandler.class);

    private final ApplicationEventPublisher eventPublisher;

    /**
     * 현재 연결된 세션들.
     * ConcurrentWebSocketSessionDecorator로 감싸서 동시 송신 충돌을 방지한다.
     */
    private final ConcurrentHashMap<String, WebSocketSession> sessions = new ConcurrentHashMap<>();

    /**
     * 세션별 요청 코드(codes 쿼리 파라미터) 저장.
     * key: sessionId, value: 해당 세션이 요청한 업비트 코드 집합
     */
    private final ConcurrentHashMap<String, Set<String>> sessionCodes = new ConcurrentHashMap<>();

    public UpbitPriceWebSocketHandler(ApplicationEventPublisher eventPublisher) {
        this.eventPublisher = eventPublisher;
    }

    @Override
    public void afterConnectionEstablished(WebSocketSession session) {
        WebSocketSession safeSession = new ConcurrentWebSocketSessionDecorator(session, 5000, 64 * 1024);
        sessions.put(session.getId(), safeSession);

        Set<String> requestedCodes = parseRequestedCodes(session);
        sessionCodes.put(session.getId(), requestedCodes);

        log.info("[UpbitWS] 클라이언트 연결: {} (총 {}개, codes={})",
                session.getId(), sessions.size(), requestedCodes);

        publishSubscriptionChangeEvent();
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
        sessions.remove(session.getId());
        sessionCodes.remove(session.getId());

        log.info("[UpbitWS] 클라이언트 해제: {} (총 {}개)", session.getId(), sessions.size());

        publishSubscriptionChangeEvent();
    }

    @Override
    public void handleTransportError(WebSocketSession session, Throwable exception) {
        log.error("[UpbitWS] 전송 오류 ({}): {}", session.getId(), exception.getMessage());
        sessions.remove(session.getId());
        sessionCodes.remove(session.getId());
        try {
            session.close();
        } catch (Exception ignored) {
            // 이미 닫혀있을 수 있어 무시
        }

        publishSubscriptionChangeEvent();
    }

    /**
     * 업비트에서 받은 원본 JSON 문자열을 전체 클라이언트에 전달.
     */
    public void broadcastPrice(String json) {
        sessions.forEach((id, session) -> {
            try {
                if (session.isOpen()) {
                    session.sendMessage(new TextMessage(json));
                } else {
                    sessions.remove(id);
                    sessionCodes.remove(id);
                }
            } catch (Exception e) {
                log.error("[UpbitWS] 메시지 전송 실패 ({}): {}", id, e.getMessage());
                sessions.remove(id);
                sessionCodes.remove(id);
            }
        });
    }

    public int getSessionCount() {
        return sessions.size();
    }

    /**
     * 현재 전체 세션의 요청 코드 합집합 스냅샷.
     */
    public Set<String> getAllRequestedCodesSnapshot() {
        LinkedHashSet<String> merged = new LinkedHashSet<>();
        sessionCodes.values().forEach(merged::addAll);
        return Collections.unmodifiableSet(merged);
    }

    /**
     * 세션 URI 쿼리에서 codes를 파싱한다.
     * 예: /ws/upbit-price?codes=KRW-BTC,KRW-USDT
     */
    private Set<String> parseRequestedCodes(WebSocketSession session) {
        if (session.getUri() == null || session.getUri().getQuery() == null) {
            return Collections.emptySet();
        }

        String query = session.getUri().getQuery();
        for (String param : query.split("&")) {
            if (!param.startsWith("codes=")) continue;

            String raw = param.substring("codes=".length());
            String decoded = URLDecoder.decode(raw, StandardCharsets.UTF_8);
            if (decoded.isBlank()) return Collections.emptySet();

            LinkedHashSet<String> normalized = new LinkedHashSet<>();
            for (String code : decoded.split(",")) {
                String trimmed = code.trim().toUpperCase(Locale.ROOT);
                if (!trimmed.isEmpty()) {
                    normalized.add(trimmed);
                }
            }
            return Collections.unmodifiableSet(normalized);
        }

        return Collections.emptySet();
    }

    private void publishSubscriptionChangeEvent() {
        Set<String> merged = getAllRequestedCodesSnapshot();
        eventPublisher.publishEvent(new UpbitSubscriptionChangeEvent(this, merged));
    }
}
