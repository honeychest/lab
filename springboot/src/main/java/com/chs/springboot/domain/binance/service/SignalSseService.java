// [AGENT] SSE 브로드캐스트 서비스 — Signal Dashboard 실시간 전송 (aggtrade, forceOrder, oi), 30초 ping
// 연관파일: SignalController.java(subscribe), AggTradeStreamService.java, ForceOrderStreamService.java, OpenInterestPollingService.java
// 주요메서드: subscribe() → SseEmitter 등록, broadcastAggTrade/ForceOrder/OiUpdate → 이벤트 전송, sendPing() → 30초 주기
package com.chs.springboot.domain.binance.service;

import com.chs.springboot.global.redis.RedisConfig;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import jakarta.annotation.PreDestroy;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.util.List;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;

@Slf4j
@Service
public class SignalSseService {

    private static final long SSE_TIMEOUT_MS = 0L;
    private static final int PUBLISH_QUEUE_CAPACITY = 2_000;

    private final List<SseEmitter> emitters = new CopyOnWriteArrayList<>();
    private final ObjectMapper objectMapper = new ObjectMapper();
    private final StringRedisTemplate redisTemplate;

    // broadcastX 호출부(AggTradeStreamService.dispatch 등)가 WebSocket 수신 스레드에서 직접 부른다.
    // emitter.send()와 Redis 발행을 그 스레드에서 동기 실행하면 느린 브라우저나 Redis 하나가
    // 소켓 읽기를 막아 거래량 급증 시 stale 오탐 → 재연결을 유발한다(실측). 각각 별도 실행기로 떼어낸다.
    // (pattern-async-sse-dispatch — springboot/AGENTS.md 패턴 카탈로그 참고)
    private final AsyncSseDispatcher dispatcher = new AsyncSseDispatcher("signal-sse-broadcast");
    // Redis 지연 중에도 WebSocket 수신 스레드와 힙이 무한정 붙잡히지 않도록 발행 큐를 제한한다.
    private final ThreadPoolExecutor publisher = new ThreadPoolExecutor(
            1,
            1,
            0L,
            TimeUnit.MILLISECONDS,
            new ArrayBlockingQueue<>(PUBLISH_QUEUE_CAPACITY),
            runnable -> {
                Thread thread = new Thread(runnable, "signal-sse-publish");
                thread.setDaemon(true);
                return thread;
            },
            new ThreadPoolExecutor.DiscardOldestPolicy());

    public SignalSseService(StringRedisTemplate redisTemplate) {
        this.redisTemplate = redisTemplate;
    }

    public SseEmitter subscribe() {
        SseEmitter emitter = new SseEmitter(SSE_TIMEOUT_MS);
        emitters.add(emitter);
        log.info("[SignalSse] 연결 등록 total={}", emitters.size());

        emitter.onTimeout(() -> {
            emitters.remove(emitter);
            log.info("[SignalSse] 연결 timeout 종료 (nginx proxy_read_timeout 의심) total={}", emitters.size());
        });
        emitter.onCompletion(() -> {
            emitters.remove(emitter);
            log.info("[SignalSse] 연결 정상 종료 (클라이언트 disconnect) total={}", emitters.size());
        });
        emitter.onError(e -> {
            emitters.remove(emitter);
            log.warn("[SignalSse] 연결 에러 종료: {} total={}", e.getMessage(), emitters.size());
        });

        try {
            emitter.send(SseEmitter.event().name("connect").data("ok"));
        } catch (IOException e) {
            emitters.remove(emitter);
            log.warn("[SignalSse] 초기 connect 이벤트 전송 실패: {}", e.getMessage());
        }

        return emitter;
    }

    public void broadcastAggTrade(Object dto) {
        publish("aggtrade", dto);
    }

    public void broadcastForceOrder(Object dto) {
        publish("forceOrder", dto);
    }

    public void broadcastOiUpdate(Object dto) {
        publish("oi", dto);
    }

    public void broadcastAnalysisMatch(Object dto) {
        publish("analysis_match", dto);
    }

    /** Redis로 발행해 모든 앱 인스턴스가 같은 이벤트를 받게 한다. */
    private void publish(String eventName, Object dto) {
        publisher.execute(() -> publishToRedis(eventName, dto));
    }

    private void publishToRedis(String eventName, Object dto) {
        try {
            ObjectNode message = objectMapper.createObjectNode();
            message.put("eventName", eventName);
            message.set("data", objectMapper.valueToTree(dto));

            Long receiverCount = redisTemplate.convertAndSend(
                    RedisConfig.SIGNAL_CHANNEL,
                    message.toString());
            if (receiverCount == null || receiverCount == 0) {
                broadcastLocal(eventName, dto);
            }
        } catch (RuntimeException e) {
            // Redis가 잠시 응답하지 않아도 현재 서버의 브라우저는 계속 갱신한다.
            log.warn("[SignalSse] Redis 발행 실패, 현재 서버만 전송 event={} error={}",
                    eventName, e.getMessage());
            broadcastLocal(eventName, dto);
        }
    }

    /** Redis 구독자가 호출하는 서버별 로컬 전송 경로. 재발행하지 않는다. */
    public void broadcastFromRedis(String payload) {
        try {
            JsonNode message = objectMapper.readTree(payload);
            String eventName = message == null ? null : message.path("eventName").asText(null);
            JsonNode data = message == null ? null : message.get("data");
            if (eventName == null || data == null) {
                log.warn("[SignalSse] 잘못된 Redis 이벤트 무시");
                return;
            }
            broadcastLocal(eventName, data);
        } catch (JsonProcessingException | RuntimeException e) {
            log.warn("[SignalSse] Redis 이벤트 파싱 실패 error={}", e.getMessage());
        }
    }

    private void broadcastLocal(String eventName, Object dto) {
        if (emitters.isEmpty()) return;
        dispatcher.dispatch(() -> doBroadcast(eventName, dto));
    }

    private void doBroadcast(String eventName, Object dto) {
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
        if (!dead.isEmpty()) {
            log.warn("[SignalSse] broadcast dead emitter {}개 제거, event={}", dead.size(), eventName);
            emitters.removeAll(dead);
        }
    }

    @PreDestroy
    public void shutdown() {
        publisher.shutdownNow();
        dispatcher.shutdown();
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
        if (!dead.isEmpty()) {
            log.warn("[SignalSse] ping dead emitter {}개 제거 (nginx keepalive 문제 의심)", dead.size());
            emitters.removeAll(dead);
        }
    }
}
