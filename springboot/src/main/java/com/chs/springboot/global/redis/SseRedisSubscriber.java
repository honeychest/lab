// [AGENT] global/redis/SseRedisSubscriber.java
// 역할: Redis Pub/Sub 구독자 — SSE 알림 중계
// - onMessage(guestToken, channel): Redis 메시지 수신 → SupportSseService.notifyLocal() 호출
// 연관: RedisConfig(sseListenerAdapter), SupportSseService
package com.chs.springboot.global.redis;

import com.chs.springboot.features.contact.service.SupportSseService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

@Slf4j
@Component
@RequiredArgsConstructor
public class SseRedisSubscriber {

    private final SupportSseService sseService;

    /**
     * Redis 채널에서 메시지 수신 시 호출
     */
    public void onMessage(String guestToken, String channel) {
        log.debug("Redis SSE 알림 수신: guestToken={}", guestToken);
        sseService.notifyLocal(guestToken);
    }
}