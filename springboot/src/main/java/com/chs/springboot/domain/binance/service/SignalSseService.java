// [AGENT] SSE 브로드캐스트 서비스 — Signal Dashboard 실시간 전송 (aggtrade, forceOrder, oi), 30초 ping
// 연관파일: SignalController.java(subscribe), AggTradeStreamService.java, ForceOrderStreamService.java, OpenInterestPollingService.java
// 주요메서드: subscribe() → SseEmitter 등록, broadcastAggTrade/ForceOrder/OiUpdate → 이벤트 전송, sendPing() → 30초 주기
package com.chs.springboot.domain.binance.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;

@Slf4j
@Service
public class SignalSseService {

    private static final long SSE_TIMEOUT_MS = 0L;

    private final List<SseEmitter> emitters = new CopyOnWriteArrayList<>();
    private final ObjectMapper objectMapper = new ObjectMapper();

    public SseEmitter subscribe() {
        SseEmitter emitter = new SseEmitter(SSE_TIMEOUT_MS);
        emitters.add(emitter);

        Runnable cleanup = () -> emitters.remove(emitter);
        emitter.onTimeout(cleanup);
        emitter.onCompletion(cleanup);
        emitter.onError(e -> cleanup.run());

        try {
            emitter.send(SseEmitter.event().name("connect").data("ok"));
        } catch (IOException e) {
            cleanup.run();
        }

        log.debug("[SignalSse] 구독 등록, 현재 emitter 수: {}", emitters.size());
        return emitter;
    }

    public void broadcastAggTrade(Object dto) {
        broadcast("aggtrade", dto);
    }

    public void broadcastForceOrder(Object dto) {
        broadcast("forceOrder", dto);
    }

    public void broadcastOiUpdate(Object dto) {
        broadcast("oi", dto);
    }

    private void broadcast(String eventName, Object dto) {
        if (emitters.isEmpty()) return;

        String json;
        try {
            json = objectMapper.writeValueAsString(dto);
        } catch (JsonProcessingException e) {
            log.error("[SignalSse] DTO 직렬화 실패: {}", e.getMessage());
            return;
        }

        List<SseEmitter> dead = new CopyOnWriteArrayList<>();
        for (SseEmitter emitter : emitters) {
            try {
                emitter.send(SseEmitter.event().name(eventName).data(json));
            } catch (IOException e) {
                dead.add(emitter);
            }
        }
        emitters.removeAll(dead);
    }

    @Scheduled(fixedDelay = 30_000)
    public void sendPing() {
        if (emitters.isEmpty()) return;

        List<SseEmitter> dead = new CopyOnWriteArrayList<>();
        for (SseEmitter emitter : emitters) {
            try {
                emitter.send(SseEmitter.event().comment("ping"));
            } catch (IOException e) {
                dead.add(emitter);
            }
        }
        emitters.removeAll(dead);
    }
}
