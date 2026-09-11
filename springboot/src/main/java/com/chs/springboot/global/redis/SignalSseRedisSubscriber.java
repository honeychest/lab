// [AGENT] global/redis/SignalSseRedisSubscriber.java
// 역할: Redis 시그널 채널 구독자 — 시그널 SSE 이벤트를 각 서버의 로컬 emitter로 중계
// 연관: RedisConfig, SignalSseService
package com.chs.springboot.global.redis;

import com.chs.springboot.domain.binance.service.SignalSseService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class SignalSseRedisSubscriber {

    private final SignalSseService signalSseService;

    public void onMessage(String payload, String channel) {
        if (!RedisConfig.SIGNAL_CHANNEL.equals(channel)) {
            return;
        }
        signalSseService.broadcastFromRedis(payload);
    }
}
