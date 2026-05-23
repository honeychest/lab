package com.chs.springboot.domain.binance.service.rawwriter;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.ValueOperations;
import org.springframework.kafka.config.KafkaListenerEndpointRegistry;
import org.springframework.kafka.listener.MessageListenerContainer;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.util.HashMap;
import java.util.Map;
import java.util.TimeZone;
import java.util.concurrent.TimeUnit;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class AggTradeRawWriterKafkaTelemetryServiceTest {

    private final KafkaPipelineSwitchboard switchboard = mock(KafkaPipelineSwitchboard.class);
    private final KafkaListenerEndpointRegistry listenerRegistry = mock(KafkaListenerEndpointRegistry.class);
    private final AggTradeRawWriterKafkaOffsetInspector offsetInspector = mock(AggTradeRawWriterKafkaOffsetInspector.class);
    private final StringRedisTemplate redisTemplate = mock(StringRedisTemplate.class);
    private final ValueOperations<String, String> valueOperations = mock(ValueOperations.class);
    private final ObjectMapper objectMapper = new ObjectMapper();
    private final Map<String, String> redisStorage = new HashMap<>();
    private final MutableClock clock = new MutableClock(Instant.parse("2026-05-23T00:00:30Z"));

    AggTradeRawWriterKafkaTelemetryServiceTest() {
        objectMapper.findAndRegisterModules();
        when(switchboard.aggTradeRawWriterPlan())
                .thenReturn(KafkaPipelineExecutionPlan.from(KafkaPipelineState.DEBUG, "raw_agg_trade", "raw_agg_trade_test"));
        when(listenerRegistry.getListenerContainer(AggTradeRawWriterConsumer.LISTENER_ID)).thenReturn(mock(MessageListenerContainer.class));
        when(redisTemplate.opsForValue()).thenReturn(valueOperations);
        when(valueOperations.get(anyString())).thenAnswer(invocation -> redisStorage.get(invocation.getArgument(0)));
        doAnswer(invocation -> {
            redisStorage.put(invocation.getArgument(0), invocation.getArgument(1));
            return null;
        }).when(valueOperations).set(anyString(), anyString(), anyLong(), eq(TimeUnit.SECONDS));
    }

    @Test
    void snapshotHydratesFromSharedRedisStateAcrossInstances() {
        AggTradeRawWriterKafkaTelemetryService leader = newService();
        leader.recordConsumed(10);
        leader.recordWriteSuccess(9);
        leader.recordDbFailure(1, "db down");

        AggTradeRawWriterKafkaTelemetryService follower = newService();
        AggTradeRawWriterKafkaTelemetryResponse response = follower.snapshot();

        assertEquals(10, response.totalConsumedRecords());
        assertEquals(9, response.totalWriteSuccessRecords());
        assertEquals(1, response.totalDbFailureRecords());
        assertEquals("db down", response.lastErrorMessage());
        assertEquals(10, response.summary().peakConsumedRecords());
        assertEquals(1, response.summary().peakDbFailureRecords());
    }

    @Test
    void windowsHydratesAndMergesSharedRedisBuckets() {
        AggTradeRawWriterKafkaTelemetryService leader = newService();
        leader.recordConsumed(10);
        clock.setInstant(Instant.parse("2026-05-23T00:01:10Z"));
        leader.recordConsumed(5);

        AggTradeRawWriterKafkaTelemetryService follower = newService();
        AggTradeRawWriterKafkaTelemetryWindowsResponse windows = follower.windows(60, 120);

        assertEquals(1, windows.windows().size());
        assertEquals(15, windows.windows().get(0).consumedRecords());
        assertEquals(120, windows.bucketSeconds());
    }

    private AggTradeRawWriterKafkaTelemetryService newService() {
        return new AggTradeRawWriterKafkaTelemetryService(
                switchboard,
                listenerRegistry,
                offsetInspector,
                redisTemplate,
                objectMapper,
                clock,
                "raw-writer-local",
                "localhost:9094"
        );
    }

    private static final class MutableClock extends Clock {
        private Instant instant;

        private MutableClock(Instant instant) {
            this.instant = instant;
        }

        private void setInstant(Instant instant) {
            this.instant = instant;
        }

        @Override
        public ZoneId getZone() {
            return TimeZone.getTimeZone("UTC").toZoneId();
        }

        @Override
        public Clock withZone(ZoneId zone) {
            return this;
        }

        @Override
        public Instant instant() {
            return instant;
        }
    }
}
