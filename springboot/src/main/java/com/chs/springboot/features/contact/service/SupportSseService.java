// [AGENT] features/contact/service/SupportSseService.java
// 역할: SSE 구독 관리 서비스 (문의 답장 실시간 알림)
// - subscribe(): guestToken별 SseEmitter 등록, 30분 타임아웃
// - notify(): Redis 채널(sse:notify)에 guestToken 발행 → 멀티서버 전파
// - notifyLocal(): 로컬 emitters에 reply 이벤트 전송 (SseRedisSubscriber 호출)
// 연관: RedisConfig.SSE_CHANNEL, SseRedisSubscriber, ContactController
package com.chs.springboot.features.contact.service;

import com.chs.springboot.global.redis.RedisConfig;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;

@Slf4j
@Service
@RequiredArgsConstructor
public class SupportSseService {

    private static final long TIMEOUT_MS = 30 * 60 * 1000L;

    private final StringRedisTemplate redisTemplate;

    private final Map<String, List<SseEmitter>> emitters = new ConcurrentHashMap<>();

    public SseEmitter subscribe(String guestToken) {
        SseEmitter emitter = new SseEmitter(TIMEOUT_MS);

        emitters.computeIfAbsent(guestToken, k -> new CopyOnWriteArrayList<>()).add(emitter);

        Runnable cleanup = () -> {
            List<SseEmitter> list = emitters.get(guestToken);
            if (list != null) {
                list.remove(emitter);
                if (list.isEmpty()) emitters.remove(guestToken);
            }
        };

        emitter.onTimeout(cleanup);
        emitter.onCompletion(cleanup);
        emitter.onError(e -> cleanup.run());

        try {
            emitter.send(SseEmitter.event().name("connect").data("ok"));
        } catch (IOException e) {
            cleanup.run();
        }

        log.debug("SSE subscribed guestToken={}", guestToken);
        return emitter;
    }

    /**
     * Redis에 알림 발행 → 모든 서버가 수신
     */
    public void notify(String guestToken) {
        if (guestToken == null) return;
        redisTemplate.convertAndSend(RedisConfig.SSE_CHANNEL, guestToken);
        log.debug("Redis SSE 알림 발행: guestToken={}", guestToken);
    }

    /**
     * 로컬 emitter에만 알림 (Redis 구독자가 호출)
     */
    public void notifyLocal(String guestToken) {
        if (guestToken == null) return;
        List<SseEmitter> list = emitters.get(guestToken);
        if (list == null || list.isEmpty()) return;

        List<SseEmitter> dead = new CopyOnWriteArrayList<>();
        for (SseEmitter emitter : list) {
            try {
                emitter.send(SseEmitter.event().name("reply").data("new"));
            } catch (IOException e) {
                dead.add(emitter);
            }
        }
        list.removeAll(dead);
        if (list.isEmpty()) emitters.remove(guestToken);
    }
}