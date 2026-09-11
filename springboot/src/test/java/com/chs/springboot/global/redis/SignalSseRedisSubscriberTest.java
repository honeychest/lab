package com.chs.springboot.global.redis;

import com.chs.springboot.domain.binance.service.SignalSseService;
import org.junit.jupiter.api.Test;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

class SignalSseRedisSubscriberTest {

    @Test
    void forwardsOnlySignalChannelMessagesToSignalSseService() {
        SignalSseService signalSseService = mock(SignalSseService.class);
        SignalSseRedisSubscriber subscriber = new SignalSseRedisSubscriber(signalSseService);
        String payload = "{\"eventName\":\"aggtrade\",\"data\":{}}";

        subscriber.onMessage(payload, RedisConfig.SIGNAL_CHANNEL);
        subscriber.onMessage(payload, RedisConfig.SSE_CHANNEL);

        verify(signalSseService).broadcastFromRedis(payload);
    }
}
