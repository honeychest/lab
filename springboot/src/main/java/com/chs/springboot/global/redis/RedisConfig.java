// [AGENT] global/redis/RedisConfig.java
// 역할: Redis Pub/Sub 설정
// - SSE_CHANNEL="sse:notify" (상수, SupportSseService에서 발행)
// - RedisMessageListenerContainer: SSE_CHANNEL → SseRedisSubscriber.onMessage() 라우팅
// - sseListenerAdapter: SseRedisSubscriber를 MessageListenerAdapter로 래핑
// - SIGNAL_CHANNEL="sse:signal" (상수, SignalSseService에서 발행)
// - signalSseListenerAdapter: SignalSseRedisSubscriber를 MessageListenerAdapter로 래핑
// 연관: SseRedisSubscriber, SupportSseService, SignalSseRedisSubscriber, SignalSseService
package com.chs.springboot.global.redis;

import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.redis.connection.RedisConnectionFactory;
import org.springframework.data.redis.listener.ChannelTopic;
import org.springframework.data.redis.listener.RedisMessageListenerContainer;
import org.springframework.data.redis.listener.adapter.MessageListenerAdapter;

@Configuration
public class RedisConfig {

    public static final String SSE_CHANNEL = "sse:notify";
    public static final String SIGNAL_CHANNEL = "sse:signal";

    @Bean
    public RedisMessageListenerContainer redisContainer(
            RedisConnectionFactory connectionFactory,
            @Qualifier("sseListenerAdapter") MessageListenerAdapter sseListenerAdapter,
            @Qualifier("signalSseListenerAdapter") MessageListenerAdapter signalSseListenerAdapter) {

        RedisMessageListenerContainer container = new RedisMessageListenerContainer();
        container.setConnectionFactory(connectionFactory);
        container.addMessageListener(sseListenerAdapter, new ChannelTopic(SSE_CHANNEL));
        container.addMessageListener(signalSseListenerAdapter, new ChannelTopic(SIGNAL_CHANNEL));
        return container;
    }

    @Bean
    public MessageListenerAdapter sseListenerAdapter(SseRedisSubscriber subscriber) {
        return new MessageListenerAdapter(subscriber, "onMessage");
    }

    @Bean
    public MessageListenerAdapter signalSseListenerAdapter(SignalSseRedisSubscriber subscriber) {
        return new MessageListenerAdapter(subscriber, "onMessage");
    }
}
