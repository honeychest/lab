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