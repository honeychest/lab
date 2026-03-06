// [AGENT] global/redis/RedisConfig.java
// 역할: Redis Pub/Sub 설정
// - SSE_CHANNEL="sse:notify" (상수, SupportSseService에서 발행)
// - RedisMessageListenerContainer: SSE_CHANNEL → SseRedisSubscriber.onMessage() 라우팅
// - sseListenerAdapter: SseRedisSubscriber를 MessageListenerAdapter로 래핑
// 연관: SseRedisSubscriber, SupportSseService
package com.chs.springboot.global.redis;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.redis.connection.RedisConnectionFactory;
import org.springframework.data.redis.listener.PatternTopic;
import org.springframework.data.redis.listener.RedisMessageListenerContainer;
import org.springframework.data.redis.listener.adapter.MessageListenerAdapter;

@Configuration
public class RedisConfig {

    public static final String SSE_CHANNEL = "sse:notify";

    @Bean
    public RedisMessageListenerContainer redisContainer(
            RedisConnectionFactory connectionFactory,
            MessageListenerAdapter sseListenerAdapter) {

        RedisMessageListenerContainer container = new RedisMessageListenerContainer();
        container.setConnectionFactory(connectionFactory);
        container.addMessageListener(sseListenerAdapter, new PatternTopic(SSE_CHANNEL));
        return container;
    }

    @Bean
    public MessageListenerAdapter sseListenerAdapter(SseRedisSubscriber subscriber) {
        return new MessageListenerAdapter(subscriber, "onMessage");
    }
}