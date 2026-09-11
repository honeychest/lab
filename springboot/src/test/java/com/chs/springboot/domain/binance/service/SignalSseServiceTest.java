package com.chs.springboot.domain.binance.service;

import com.chs.springboot.global.redis.RedisConfig;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.data.redis.core.StringRedisTemplate;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.timeout;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class SignalSseServiceTest {

    private StringRedisTemplate redisTemplate;
    private SignalSseService service;

    @BeforeEach
    void setUp() {
        redisTemplate = mock(StringRedisTemplate.class);
        service = new SignalSseService(redisTemplate);
    }

    @AfterEach
    void tearDown() {
        service.shutdown();
    }

    @Test
    void publishesSignalEventEnvelopeToSharedRedisChannel() throws Exception {
        when(redisTemplate.convertAndSend(eq(RedisConfig.SIGNAL_CHANNEL), anyString())).thenReturn(2L);

        service.broadcastAggTrade(Map.of(
                "symbol", "BTCUSDT",
                "price", "100",
                "quantity", "2"
        ));

        var payloadCaptor = org.mockito.ArgumentCaptor.forClass(String.class);
        verify(redisTemplate, timeout(1_000))
                .convertAndSend(eq(RedisConfig.SIGNAL_CHANNEL), payloadCaptor.capture());

        JsonNode message = new ObjectMapper().readTree(payloadCaptor.getValue());
        assertThat(message.path("eventName").asText()).isEqualTo("aggtrade");
        assertThat(message.path("data").path("symbol").asText()).isEqualTo("BTCUSDT");
        assertThat(message.path("data").path("price").asText()).isEqualTo("100");
    }
}
