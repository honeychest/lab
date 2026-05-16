package com.chs.springboot.domain.binance.service.rawwriter;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.kafka.config.KafkaListenerEndpointRegistry;
import org.springframework.kafka.listener.MessageListenerContainer;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
public class AggTradeRawWriterKafkaTelemetryService {

    private static final String RAW_TOPIC = "market.aggtrade.raw";
    private static final String DLQ_TOPIC = "market.aggtrade.dlq";
    private static final long BASE_BUCKET_MS = KafkaWindow.TELEMETRY_BUCKET_MS;
    private static final long RETENTION_MS = 24L * 60L * 60L * 1000L;
    private static final int MAX_FAILURE_SAMPLES = 50;

    private final KafkaPipelineSwitchboard switchboard;
    private final KafkaListenerEndpointRegistry listenerRegistry;
    private final AggTradeRawWriterKafkaOffsetInspector offsetInspector;
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
    private long totalSuccessfulBatches;
    private long totalFailedBatches;
    private Long lastSuccessAtMs;
    private Long lastErrorAtMs;
    private String lastErrorMessage;

    public AggTradeRawWriterKafkaTelemetryService(
            KafkaPipelineSwitchboard switchboard,
            KafkaListenerEndpointRegistry listenerRegistry,
            AggTradeRawWriterKafkaOffsetInspector offsetInspector,
            @Value("${kafka.consumer.group-id:raw-writer}") String consumerGroupId,
            @Value("${spring.kafka.bootstrap-servers:kafka:9092}") String bootstrapServers
    ) {
        this.switchboard = switchboard;
        this.listenerRegistry = listenerRegistry;
        this.offsetInspector = offsetInspector;
        this.consumerGroupId = consumerGroupId;
        this.bootstrapServers = bootstrapServers;
    }

    public synchronized void recordConsumed(int count) {
        long now = System.currentTimeMillis();
        totalConsumedRecords += count;
        bucketStore.recordConsumed(now, count);
    }

    public synchronized void recordWriteSuccess(int count) {
        long now = System.currentTimeMillis();
        totalWriteSuccessRecords += count;
        totalSuccessfulBatches += 1;
        lastSuccessAtMs = now;
        bucketStore.recordWriteSuccess(now, count);
    }

    public synchronized void recordInvalidRecord(String symbol, String marketType, Integer partition, Long offset, String errorMessage) {
        long now = System.currentTimeMillis();
        totalInvalidRecords += 1;
        bucketStore.recordInvalid(now);
        failureSamples.add(new AggTradeRawWriterKafkaFailureSample(
                now, "INVALID", symbol, marketType, partition, offset, errorMessage
        ));
    }

    public synchronized void recordDlqPublished(String symbol, String marketType, Integer partition, Long offset, String errorMessage) {
        long now = System.currentTimeMillis();
        totalDlqPublishedRecords += 1;
        bucketStore.recordDlqPublished(now);
        failureSamples.add(new AggTradeRawWriterKafkaFailureSample(
                now, "DLQ_PUBLISHED", symbol, marketType, partition, offset, errorMessage
        ));
    }

    public synchronized void recordDlqPublishFailure(String symbol, String marketType, Integer partition, Long offset, String errorMessage) {
        long now = System.currentTimeMillis();
        totalDlqPublishFailureRecords += 1;
        totalFailedBatches += 1;
        lastErrorAtMs = now;
        lastErrorMessage = errorMessage;
        bucketStore.recordDlqPublishFailure(now);
        failureSamples.add(new AggTradeRawWriterKafkaFailureSample(
                now, "DLQ_PUBLISH_FAIL", symbol, marketType, partition, offset, errorMessage
        ));
    }

    public synchronized void recordDbFailure(int count, String errorMessage) {
        long now = System.currentTimeMillis();
        totalDbFailureRecords += count;
        totalFailedBatches += 1;
        lastErrorAtMs = now;
        lastErrorMessage = errorMessage;
        bucketStore.recordDbFailure(now, count);
    }

    public synchronized void recordFailedBatch(String errorMessage) {
        long now = System.currentTimeMillis();
        totalFailedBatches += 1;
        lastErrorAtMs = now;
        lastErrorMessage = errorMessage;
        bucketStore.recordFailedBatch(now);
    }

    public synchronized AggTradeRawWriterKafkaTelemetryWindowsResponse windows(int minutes, int bucketSeconds) {
        long now = System.currentTimeMillis();
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
}
