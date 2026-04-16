package com.chs.springboot.domain.binance.websocket;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.ConcurrentWebSocketSessionDecorator;
import org.springframework.web.socket.handler.TextWebSocketHandler;
import org.springframework.web.util.UriComponentsBuilder;

import java.util.Locale;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Manages frontend Binance WS sessions and broadcasts ticker payloads by symbol.
 */
@Component
public class BinancePriceWebSocketHandler extends TextWebSocketHandler {

    private static final Logger log = LoggerFactory.getLogger(BinancePriceWebSocketHandler.class);
    private static final String DEFAULT_SYMBOL = "BTCUSDT";

    private final ConcurrentHashMap<String, WebSocketSession> sessions = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, String> sessionSymbols = new ConcurrentHashMap<>();

    @Override
    public void afterConnectionEstablished(WebSocketSession session) {
        WebSocketSession safeSession = new ConcurrentWebSocketSessionDecorator(session, 5000, 64 * 1024);
        sessions.put(session.getId(), safeSession);

        String symbol = UriComponentsBuilder.fromUri(session.getUri())
                .build()
                .getQueryParams()
                .getFirst("symbol");

        String normalized = normalizeSymbol(symbol);
        sessionSymbols.put(session.getId(), normalized);

        log.info("[BinanceWS] connected: {} (total={}, symbol={})", session.getId(), sessions.size(), normalized);
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
        sessions.remove(session.getId());
        sessionSymbols.remove(session.getId());
        log.info("[BinanceWS] disconnected: {} (total={})", session.getId(), sessions.size());
    }

    @Override
    public void handleTransportError(WebSocketSession session, Throwable exception) {
        log.error("[BinanceWS] transport error ({}): {}", session.getId(), exception.getMessage());
        sessions.remove(session.getId());
        sessionSymbols.remove(session.getId());
        try {
            session.close();
        } catch (Exception ignored) {
            // ignore
        }
    }

    public void broadcastPrice(String json, String symbol) {
        String normalizedSymbol = normalizeSymbol(symbol);

        sessions.forEach((id, session) -> {
            try {
                if (!session.isOpen()) {
                    sessions.remove(id);
                    sessionSymbols.remove(id);
                    return;
                }

                String requested = sessionSymbols.getOrDefault(id, DEFAULT_SYMBOL);
                if (!requested.equals(normalizedSymbol)) {
                    return;
                }

                session.sendMessage(new TextMessage(json));
            } catch (Exception e) {
                log.error("[BinanceWS] send failed ({}): {}", id, e.getMessage());
                sessions.remove(id);
                sessionSymbols.remove(id);
            }
        });
    }

    public int getSessionCount() {
        return sessions.size();
    }

    private String normalizeSymbol(String symbol) {
        if (symbol == null || symbol.isBlank()) {
            return DEFAULT_SYMBOL;
        }
        return symbol.trim().toUpperCase(Locale.ROOT);
    }
}
