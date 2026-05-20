package com.chs.springboot.domain.upbit.websocket;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
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
 * Manages frontend Upbit WS sessions and filters broadcasts by requested codes.
 */
@Component
public class UpbitPriceWebSocketHandler extends TextWebSocketHandler {

    private static final Logger log = LoggerFactory.getLogger(UpbitPriceWebSocketHandler.class);

    private final ConcurrentHashMap<String, WebSocketSession> sessions = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, Set<String>> sessionCodes = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, String> lastTickerByCode = new ConcurrentHashMap<>();
    private final ObjectMapper objectMapper = new ObjectMapper();

    @Override
    public void afterConnectionEstablished(WebSocketSession session) {
        WebSocketSession safeSession = new ConcurrentWebSocketSessionDecorator(session, 5000, 64 * 1024);
        sessions.put(session.getId(), safeSession);

        Set<String> requestedCodes = parseRequestedCodes(session);
        sessionCodes.put(session.getId(), requestedCodes);

        log.info("[UpbitWS] connected: {} (total={}, codes={})", session.getId(), sessions.size(), requestedCodes);

        sendCachedSnapshots(safeSession, requestedCodes);
    }

    private void sendCachedSnapshots(WebSocketSession session, Set<String> requestedCodes) {
        if (!session.isOpen()) return;

        Set<String> targets = requestedCodes.isEmpty() ? lastTickerByCode.keySet() : requestedCodes;
        for (String code : targets) {
            String cached = lastTickerByCode.get(code);
            if (cached == null) continue;
            try {
                session.sendMessage(new TextMessage(cached));
            } catch (Exception e) {
                log.error("[UpbitWS] snapshot send failed ({}, code={}): {}", session.getId(), code, e.getMessage());
                return;
            }
        }
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
        sessions.remove(session.getId());
        sessionCodes.remove(session.getId());
        log.info("[UpbitWS] disconnected: {} (total={})", session.getId(), sessions.size());
    }

    @Override
    public void handleTransportError(WebSocketSession session, Throwable exception) {
        log.error("[UpbitWS] transport error ({}): {}", session.getId(), exception.getMessage());
        sessions.remove(session.getId());
        sessionCodes.remove(session.getId());
        try {
            session.close();
        } catch (Exception ignored) {
            // ignore
        }
    }

    public void broadcastPrice(String json) {
        String code = extractCode(json);
        if (code == null) return;

        lastTickerByCode.put(code, json);

        sessions.forEach((id, session) -> {
            try {
                if (!session.isOpen()) {
                    sessions.remove(id);
                    sessionCodes.remove(id);
                    return;
                }

                Set<String> requested = sessionCodes.getOrDefault(id, Collections.emptySet());
                if (!requested.isEmpty() && !requested.contains(code)) {
                    return;
                }

                session.sendMessage(new TextMessage(json));
            } catch (Exception e) {
                log.error("[UpbitWS] send failed ({}): {}", id, e.getMessage());
                sessions.remove(id);
                sessionCodes.remove(id);
            }
        });
    }

    public int getSessionCount() {
        return sessions.size();
    }

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

    private String extractCode(String json) {
        try {
            JsonNode node = objectMapper.readTree(json);
            String code = node.path("code").asText(null);
            if (code == null || code.isBlank()) return null;
            return code.toUpperCase(Locale.ROOT);
        } catch (Exception ignored) {
            return null;
        }
    }
}
