package com.chs.springboot.domain.binance.service.rawwriter;

import org.apache.kafka.clients.admin.AdminClient;
import org.apache.kafka.clients.admin.AdminClientConfig;
import org.apache.kafka.clients.admin.ListOffsetsResult;
import org.apache.kafka.clients.admin.OffsetSpec;
import org.apache.kafka.clients.admin.TopicDescription;
import org.apache.kafka.clients.consumer.OffsetAndMetadata;
import org.apache.kafka.common.TopicPartition;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.kafka.config.KafkaListenerEndpointRegistry;
import org.springframework.kafka.listener.MessageListenerContainer;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.NavigableMap;
import java.util.TreeMap;

@Service
public class AggTradeRawWriterKafkaTelemetryService {

    private static final String RAW_TOPIC = "market.aggtrade.raw";
    private static final String DLQ_TOPIC = "market.aggtrade.dlq";
    private static final long BASE_BUCKET_MS = 60_000L;
    private static final long RETENTION_MS = 24L * 60L * 60L * 1000L;

    private final KafkaPipelineSwitchboard switchboard;
    private final KafkaListenerEndpointRegistry listenerRegistry;
    private final String consumerGroupId;
    private final String bootstrapServers;

    private final NavigableMap<Long, WindowAccumulator> buckets = new TreeMap<>();

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
            @Value("${kafka.consumer.group-id:raw-writer}") String consumerGroupId,
            @Value("${spring.kafka.bootstrap-servers:kafka:9092}") String bootstrapServers
    ) {
        this.switchboard = switchboard;
        this.listenerRegistry = listenerRegistry;
        this.consumerGroupId = consumerGroupId;
        this.bootstrapServers = bootstrapServers;
    }

    public synchronized void recordConsumed(int count) {
        long now = System.currentTimeMillis();
        totalConsumedRecords += count;
        bucket(now).consumedRecords += count;
        cleanup(now);
    }

    public synchronized void recordWriteSuccess(int count) {
        long now = System.currentTimeMillis();
        totalWriteSuccessRecords += count;
        totalSuccessfulBatches += 1;
        lastSuccessAtMs = now;
        bucket(now).writeSuccessRecords += count;
        bucket(now).successfulBatches += 1;
        cleanup(now);
    }

    public synchronized void recordInvalidRecord() {
        long now = System.currentTimeMillis();
        totalInvalidRecords += 1;
        bucket(now).invalidRecords += 1;
        cleanup(now);
    }

    public synchronized void recordDlqPublished() {
        long now = System.currentTimeMillis();
        totalDlqPublishedRecords += 1;
        bucket(now).dlqPublishedRecords += 1;
        cleanup(now);
    }

    public synchronized void recordDlqPublishFailure(String errorMessage) {
        long now = System.currentTimeMillis();
        totalDlqPublishFailureRecords += 1;
        totalFailedBatches += 1;
        lastErrorAtMs = now;
        lastErrorMessage = errorMessage;
        bucket(now).dlqPublishFailureRecords += 1;
        bucket(now).failedBatches += 1;
        cleanup(now);
    }

    public synchronized void recordDbFailure(int count, String errorMessage) {
        long now = System.currentTimeMillis();
        totalDbFailureRecords += count;
        totalFailedBatches += 1;
        lastErrorAtMs = now;
        lastErrorMessage = errorMessage;
        bucket(now).dbFailureRecords += count;
        bucket(now).failedBatches += 1;
        cleanup(now);
    }

    public synchronized void recordFailedBatch(String errorMessage) {
        long now = System.currentTimeMillis();
        totalFailedBatches += 1;
        lastErrorAtMs = now;
        lastErrorMessage = errorMessage;
        bucket(now).failedBatches += 1;
        cleanup(now);
    }

    public synchronized AggTradeRawWriterKafkaTelemetryWindowsResponse windows(int minutes, int bucketSeconds) {
        long now = System.currentTimeMillis();
        cleanup(now);
        long bucketMs = Math.max(60, bucketSeconds) * 1000L;
        long fromMs = now - (minutes * 60_000L);
        Map<Long, WindowAccumulator> merged = new LinkedHashMap<>();
        for (Map.Entry<Long, WindowAccumulator> entry : buckets.tailMap(fromMs, true).entrySet()) {
            long bucketStart = entry.getKey() - (entry.getKey() % bucketMs);
            merged.computeIfAbsent(bucketStart, ignored -> new WindowAccumulator()).merge(entry.getValue());
        }
        List<AggTradeRawWriterKafkaTelemetryWindow> rows = merged.entrySet().stream()
                .sorted(Map.Entry.comparingByKey())
                .map(entry -> entry.getValue().toWindow(entry.getKey(), entry.getKey() + bucketMs))
                .toList();
        return new AggTradeRawWriterKafkaTelemetryWindowsResponse(minutes, (int) (bucketMs / 1000L), rows);
    }

    public AggTradeRawWriterKafkaTelemetryResponse snapshot() {
        KafkaPipelineExecutionPlan plan = switchboard.aggTradeRawWriterPlan();
        MessageListenerContainer container = listenerRegistry.getListenerContainer(AggTradeRawWriterConsumer.LISTENER_ID);
        boolean listenerRunning = container != null && container.isRunning();
        AggTradeRawWriterKafkaTopicSnapshot rawTopic = loadTopicSnapshot(RAW_TOPIC, true);
        AggTradeRawWriterKafkaTopicSnapshot dlqTopic = loadTopicSnapshot(DLQ_TOPIC, false);

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
                    rawTopic,
                    dlqTopic
            );
        }
    }

    private AggTradeRawWriterKafkaTopicSnapshot loadTopicSnapshot(String topic, boolean includeCommittedOffset) {
        Map<String, Object> config = new HashMap<>();
        config.put(AdminClientConfig.BOOTSTRAP_SERVERS_CONFIG, bootstrapServers);
        config.put(AdminClientConfig.REQUEST_TIMEOUT_MS_CONFIG, (int) Duration.ofSeconds(3).toMillis());
        config.put(AdminClientConfig.DEFAULT_API_TIMEOUT_MS_CONFIG, (int) Duration.ofSeconds(3).toMillis());

        try (AdminClient adminClient = AdminClient.create(config)) {
            TopicDescription topicDescription = adminClient.describeTopics(List.of(topic))
                    .allTopicNames()
                    .get()
                    .get(topic);
            List<TopicPartition> topicPartitions = topicDescription.partitions().stream()
                    .map(partition -> new TopicPartition(topic, partition.partition()))
                    .sorted(Comparator.comparingInt(TopicPartition::partition))
                    .toList();

            Map<TopicPartition, OffsetSpec> latestRequests = new LinkedHashMap<>();
            topicPartitions.forEach(partition -> latestRequests.put(partition, OffsetSpec.latest()));
            Map<TopicPartition, ListOffsetsResult.ListOffsetsResultInfo> latestOffsets = adminClient
                    .listOffsets(latestRequests)
                    .all()
                    .get();

            Map<TopicPartition, OffsetAndMetadata> committedOffsets = includeCommittedOffset
                    ? adminClient.listConsumerGroupOffsets(consumerGroupId).partitionsToOffsetAndMetadata().get()
                    : Map.of();

            long latestOffsetSum = 0L;
            long committedOffsetSum = 0L;
            long lagSum = 0L;
            List<AggTradeRawWriterKafkaPartitionSnapshot> partitions = new ArrayList<>();
            for (TopicPartition partition : topicPartitions) {
                long latestOffset = latestOffsets.get(partition).offset();
                latestOffsetSum += latestOffset;
                Long committedOffset = null;
                Long lag = null;
                if (includeCommittedOffset) {
                    OffsetAndMetadata committed = committedOffsets.get(partition);
                    committedOffset = committed != null ? committed.offset() : 0L;
                    committedOffsetSum += committedOffset;
                    lag = Math.max(0L, latestOffset - committedOffset);
                    lagSum += lag;
                }
                partitions.add(new AggTradeRawWriterKafkaPartitionSnapshot(
                        partition.partition(),
                        latestOffset,
                        committedOffset,
                        lag
                ));
            }
            return new AggTradeRawWriterKafkaTopicSnapshot(
                    topic,
                    topicPartitions.size(),
                    latestOffsetSum,
                    includeCommittedOffset ? committedOffsetSum : null,
                    includeCommittedOffset ? lagSum : null,
                    null,
                    partitions
            );
        } catch (Exception e) {
            return new AggTradeRawWriterKafkaTopicSnapshot(
                    topic,
                    null,
                    null,
                    null,
                    null,
                    e.getMessage(),
                    List.of()
            );
        }
    }

    private WindowAccumulator bucket(long now) {
        long bucketStart = now - (now % BASE_BUCKET_MS);
        return buckets.computeIfAbsent(bucketStart, ignored -> new WindowAccumulator());
    }

    private void cleanup(long now) {
        long threshold = now - RETENTION_MS;
        buckets.headMap(threshold, false).clear();
    }

    private static final class WindowAccumulator {
        private long consumedRecords;
        private long writeSuccessRecords;
        private long invalidRecords;
        private long dlqPublishedRecords;
        private long dlqPublishFailureRecords;
        private long dbFailureRecords;
        private long successfulBatches;
        private long failedBatches;

        private void merge(WindowAccumulator other) {
            this.consumedRecords += other.consumedRecords;
            this.writeSuccessRecords += other.writeSuccessRecords;
            this.invalidRecords += other.invalidRecords;
            this.dlqPublishedRecords += other.dlqPublishedRecords;
            this.dlqPublishFailureRecords += other.dlqPublishFailureRecords;
            this.dbFailureRecords += other.dbFailureRecords;
            this.successfulBatches += other.successfulBatches;
            this.failedBatches += other.failedBatches;
        }

        private AggTradeRawWriterKafkaTelemetryWindow toWindow(long bucketStartMs, long bucketEndMs) {
            return new AggTradeRawWriterKafkaTelemetryWindow(
                    bucketStartMs,
                    bucketEndMs,
                    consumedRecords,
                    writeSuccessRecords,
                    invalidRecords,
                    dlqPublishedRecords,
                    dlqPublishFailureRecords,
                    dbFailureRecords,
                    successfulBatches,
                    failedBatches
            );
        }
    }
}
