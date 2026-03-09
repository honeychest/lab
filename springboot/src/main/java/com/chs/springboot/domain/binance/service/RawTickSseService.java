// [AGENT] 실시간 틱 SSE 브로드캐스트 | 연관파일: BinanceTradeService.java, BinanceTradeController.java
// 주요메서드: subscribe() → SseEmitter 등록, broadcast(dto) → 전체 전송, send 실패 시 completeWithError 후 제거
package com.chs.springboot.domain.binance.service;

import com.chs.springboot.domain.binance.model.RawTickDto;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;

@Slf4j
@Service
public class RawTickSseService {

    private static final long SSE_TIMEOUT_MS = 0L;

    private final List<SseEmitter> emitters = new CopyOnWriteArrayList<>();
    private final ObjectMapper objectMapper = new ObjectMapper();

    /** 클라이언트 틱 SSE 구독 등록 */
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
            emitter.completeWithError(e);
            cleanup.run();
        }

        log.debug("[RawTickSse] 구독 등록, 현재 emitter 수: {}", emitters.size());
        return emitter;
    }

    /** Binance 체결 수신 시 호출 — 모든 구독자에게 틱 전송. 실패 시 해당 emitter 제거 */
    public void broadcast(RawTickDto dto) {
        if (emitters.isEmpty()) return;

        String json;
        try {
            json = objectMapper.writeValueAsString(dto);
        } catch (JsonProcessingException e) {
            log.error("[RawTickSse] DTO 직렬화 실패: {}", e.getMessage());
            return;
        }

        List<SseEmitter> dead = new CopyOnWriteArrayList<>();
        for (SseEmitter emitter : emitters) {
            try {
                emitter.send(SseEmitter.event().name("tick").data(json));
            } catch (Exception e) {
                try {
                    emitter.completeWithError(e);
                } catch (Exception ignored) {
                    // 이미 완료된 emitter 등
                }
                dead.add(emitter);
                log.debug("[RawTickSse] broadcast send 실패(emitter 제거): {}", e.getMessage());
            }
        }
        emitters.removeAll(dead);
    }
}
