package com.chs.springboot.domain.binance.service.rawwriter;

import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.kafka.config.KafkaListenerEndpointRegistry;
import org.springframework.kafka.listener.MessageListenerContainer;
import org.springframework.stereotype.Service;

import java.time.Clock;
import java.util.List;
import java.util.concurrent.TimeUnit;

@Slf4j
@Service
public class AggTradeRawWriterKafkaTelemetryService {

    private static final String RAW_TOPIC = "market.aggtrade.raw";
    private static final String DLQ_TOPIC = "market.aggtrade.dlq";
    private static final long BASE_BUCKET_MS = KafkaWindow.TELEMETRY_BUCKET_MS;
    private static final long RETENTION_MS = 24L * 60L * 60L * 1000L;
    private static final int MAX_FAILURE_SAMPLES = 50;
    private static final String CACHE_KEY = "aggtrade:raw-writer:kafka-telemetry";
    private static final long CACHE_TTL_SECONDS = 26L * 60L * 60L;

    private final KafkaPipelineSwitchboard switchboard;
    private final KafkaListenerEndpointRegistry listenerRegistry;
    private final AggTradeRawWriterKafkaOffsetInspector offsetInspector;
    private final StringRedisTemplate redisTemplate;
    private final ObjectMapper objectMapper;
    private final Clock clock;
    private final String consumerGroupId;
    private final String bootstrapServers;

    private final AggTradeRawWriterTelemetryBucketStore bucketStore =
            new AggTradeRawWriterTelemetryBucketStore(BASE_BUCKET_MS, RETENTION_MS);
    private final AggTradeRawWriterFailureSampleBuffer failureSamples =
            new AggTradeRawWriterFailureSampleBuffer(MAX_FAILURE_SAMPLES);

    private long totalConsumedRecords;
    private long totalWriteSuccessRecords;
    private long totalInvalidRecords;
    private long totalDlqPublishedRecords;
    private long totalDlqPublishFailureRecords;
    private long totalDbFailureRecords;
    private long totalRetrySuccessRecords;
    private long totalSuccessfulBatches;
    private long totalFailedBatches;
    private Long lastSuccessAtMs;
    private Long lastErrorAtMs;
    private String lastErrorMessage;
    private boolean hydrated;

    public AggTradeRawWriterKafkaTelemetryService(
            KafkaPipelineSwitchboard switchboard,
            KafkaListenerEndpointRegistry listenerRegistry,
            AggTradeRawWriterKafkaOffsetInspector offsetInspector,
            StringRedisTemplate redisTemplate,
            ObjectMapper objectMapper,
            Clock clock,
            @Value("${kafka.consumer.group-id:raw-writer}") String consumerGroupId,
            @Value("${spring.kafka.bootstrap-servers:kafka:9092}") String bootstrapServers
    ) {
        this.switchboard = switchboard;
        this.listenerRegistry = listenerRegistry;
        this.offsetInspector = offsetInspector;
        this.redisTemplate = redisTemplate;
        this.objectMapper = objectMapper;
        this.clock = clock;
        this.consumerGroupId = consumerGroupId;
        this.bootstrapServers = bootstrapServers;
    }

    public synchronized void recordConsumed(int count) {
        ensureHydrated();
        long now = clock.millis();
        totalConsumedRecords += count;
        bucketStore.recordConsumed(now, count);
        persistSharedState(now);
    }

    public synchronized void recordWriteSuccess(int count) {
        ensureHydrated();
        long now = clock.millis();
        totalWriteSuccessRecords += count;
        totalSuccessfulBatches += 1;
        lastSuccessAtMs = now;
        bucketStore.recordWriteSuccess(now, count);
        persistSharedState(now);
    }

    public synchronized void recordInvalidRecord(String symbol, String marketType, Integer partition, Long offset, String errorMessage) {
        ensureHydrated();
        long now = clock.millis();
        totalInvalidRecords += 1;
        bucketStore.recordInvalid(now);
        failureSamples.add(new AggTradeRawWriterKafkaFailureSample(
                now, "INVALID", symbol, marketType, partition, offset, errorMessage
        ));
        persistSharedState(now);
    }

    public synchronized void recordDlqPublished(String symbol, String marketType, Integer partition, Long offset, String errorMessage) {
        ensureHydrated();
        long now = clock.millis();
        totalDlqPublishedRecords += 1;
        bucketStore.recordDlqPublished(now);
        failureSamples.add(new AggTradeRawWriterKafkaFailureSample(
                now, "DLQ_PUBLISHED", symbol, marketType, partition, offset, errorMessage
        ));
        persistSharedState(now);
    }

    public synchronized void recordDlqPublishFailure(String symbol, String marketType, Integer partition, Long offset, String errorMessage) {
        ensureHydrated();
        long now = clock.millis();
        totalDlqPublishFailureRecords += 1;
        totalFailedBatches += 1;
        lastErrorAtMs = now;
        lastErrorMessage = errorMessage;
        bucketStore.recordDlqPublishFailure(now);
        failureSamples.add(new AggTradeRawWriterKafkaFailureSample(
                now, "DLQ_PUBLISH_FAIL", symbol, marketType, partition, offset, errorMessage
        ));
        persistSharedState(now);
    }

    public synchronized void recordDbFailure(int count, String errorMessage) {
        ensureHydrated();
        long now = clock.millis();
        totalDbFailureRecords += count;
        totalFailedBatches += 1;
        lastErrorAtMs = now;
        lastErrorMessage = errorMessage;
        bucketStore.recordDbFailure(now, count);
        persistSharedState(now);
    }

    public synchronized void recordRetrySuccess(int count) {
        ensureHydrated();
        long now = clock.millis();
        totalRetrySuccessRecords += count;
        bucketStore.recordRetrySuccess(now, count);
        persistSharedState(now);
    }

    public synchronized void recordFailedBatch(String errorMessage) {
        ensureHydrated();
        long now = clock.millis();
        totalFailedBatches += 1;
        lastErrorAtMs = now;
        lastErrorMessage = errorMessage;
        bucketStore.recordFailedBatch(now);
        persistSharedState(now);
    }

    public synchronized AggTradeRawWriterKafkaTelemetryWindowsResponse windows(int minutes, int bucketSeconds) {
        ensureHydrated();
        long now = clock.millis();
        long bucketMs = Math.max(60, bucketSeconds) * 1000L;
        List<AggTradeRawWriterKafkaTelemetryWindow> rows = bucketStore.windows(now, minutes, bucketSeconds);
        return new AggTradeRawWriterKafkaTelemetryWindowsResponse(minutes, (int) (bucketMs / 1000L), rows);
    }

    public AggTradeRawWriterKafkaTelemetryResponse snapshot() {
        KafkaPipelineExecutionPlan plan = switchboard.aggTradeRawWriterPlan();
        MessageListenerContainer container = listenerRegistry.getListenerContainer(AggTradeRawWriterConsumer.LISTENER_ID);
        boolean listenerRunning = container != null && container.isRunning();
        AggTradeRawWriterKafkaTopicSnapshot rawTopic = offsetInspector.loadTopicSnapshot(RAW_TOPIC, consumerGroupId, true);
        AggTradeRawWriterKafkaTopicSnapshot dlqTopic = offsetInspector.loadTopicSnapshot(DLQ_TOPIC, consumerGroupId, false);

        synchronized (this) {
            ensureHydrated();
            return new AggTradeRawWriterKafkaTelemetryResponse(
                    plan.mode(),
                    plan.enabled(),
                    plan.dryRun(),
                    plan.targetTable(),
                    listenerRunning,
                    consumerGroupId,
                    bootstrapServers,
                    totalConsumedRecords,
                    totalWriteSuccessRecords,
                    totalInvalidRecords,
                    totalDlqPublishedRecords,
                    totalDlqPublishFailureRecords,
                    totalDbFailureRecords,
                    totalRetrySuccessRecords,
                    totalSuccessfulBatches,
                    totalFailedBatches,
                    lastSuccessAtMs,
                    lastErrorAtMs,
                    lastErrorMessage,
                    bucketStore.summarize(),
                    failureSamples.snapshot(),
                    rawTopic,
                    dlqTopic
            );
        }
    }

    private void ensureHydrated() {
        if (hydrated) {
            return;
        }
        SharedTelemetryState cached = readSharedState();
        if (cached != null) {
            totalConsumedRecords = cached.totalConsumedRecords();
            totalWriteSuccessRecords = cached.totalWriteSuccessRecords();
            totalInvalidRecords = cached.totalInvalidRecords();
            totalDlqPublishedRecords = cached.totalDlqPublishedRecords();
            totalDlqPublishFailureRecords = cached.totalDlqPublishFailureRecords();
            totalDbFailureRecords = cached.totalDbFailureRecords();
            totalRetrySuccessRecords = cached.totalRetrySuccessRecords();
            totalSuccessfulBatches = cached.totalSuccessfulBatches();
            totalFailedBatches = cached.totalFailedBatches();
            lastSuccessAtMs = cached.lastSuccessAtMs();
            lastErrorAtMs = cached.lastErrorAtMs();
            lastErrorMessage = cached.lastErrorMessage();
            bucketStore.restore(cached.baseWindows());
            failureSamples.restore(cached.recentFailures());
        }
        hydrated = true;
    }

    private void persistSharedState(long now) {
        try {
            SharedTelemetryState state = new SharedTelemetryState(
                    totalConsumedRecords,
                    totalWriteSuccessRecords,
                    totalInvalidRecords,
                    totalDlqPublishedRecords,
                    totalDlqPublishFailureRecords,
                    totalDbFailureRecords,
                    totalRetrySuccessRecords,
                    totalSuccessfulBatches,
                    totalFailedBatches,
                    lastSuccessAtMs,
                    lastErrorAtMs,
                    lastErrorMessage,
                    failureSamples.snapshot(),
                    bucketStore.snapshot(),
                    now
            );
            redisTemplate.opsForValue().set(
                    CACHE_KEY,
                    objectMapper.writeValueAsString(state),
                    CACHE_TTL_SECONDS,
                    TimeUnit.SECONDS
            );
        } catch (Exception e) {
            log.warn("[AggTradeRawWriterTelemetry] Redis cache write failed: {}", e.getMessage());
        }
    }

    private SharedTelemetryState readSharedState() {
        try {
            String json = redisTemplate.opsForValue().get(CACHE_KEY);
            if (json == null || json.isBlank()) {
                return null;
            }
            return objectMapper.readValue(json, SharedTelemetryState.class);
        } catch (Exception e) {
            log.warn("[AggTradeRawWriterTelemetry] Redis cache read failed: {}", e.getMessage());
            return null;
        }
    }

    private record SharedTelemetryState(
            long totalConsumedRecords,
            long totalWriteSuccessRecords,
            long totalInvalidRecords,
            long totalDlqPublishedRecords,
            long totalDlqPublishFailureRecords,
            long totalDbFailureRecords,
            long totalRetrySuccessRecords,
            long totalSuccessfulBatches,
            long totalFailedBatches,
            Long lastSuccessAtMs,
            Long lastErrorAtMs,
            String lastErrorMessage,
            List<AggTradeRawWriterKafkaFailureSample> recentFailures,
            List<AggTradeRawWriterKafkaTelemetryWindow> baseWindows,
            long updatedAtMs
    ) {
    }
}
