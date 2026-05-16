package com.chs.springboot.domain.binance.service.rawwriter;

import org.apache.kafka.clients.admin.AdminClient;
import org.apache.kafka.clients.admin.AdminClientConfig;
import org.apache.kafka.clients.admin.ListOffsetsResult;
import org.apache.kafka.clients.admin.OffsetSpec;
import org.apache.kafka.clients.admin.TopicDescription;
import org.apache.kafka.clients.consumer.OffsetAndMetadata;
import org.apache.kafka.common.TopicPartition;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Component
public class AggTradeRawWriterKafkaOffsetInspector {

    private final String bootstrapServers;

    public AggTradeRawWriterKafkaOffsetInspector(
            @Value("${spring.kafka.bootstrap-servers:kafka:9092}") String bootstrapServers
    ) {
        this.bootstrapServers = bootstrapServers;
    }

    public AggTradeRawWriterKafkaTopicSnapshot loadTopicSnapshot(
            String topic,
            String consumerGroupId,
            boolean includeCommittedOffset
    ) {
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
}
