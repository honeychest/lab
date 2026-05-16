package com.chs.springboot.domain.binance.service.rawwriter;

public record AggTradeRawWriterKafkaTelemetryResponse(
        String mode,
        boolean enabled,
        boolean dryRun,
        String targetTable,
        boolean listenerRunning,
        String consumerGroupId,
        String bootstrapServers,
        long totalConsumedRecords,
        long totalWriteSuccessRecords,
        long totalInvalidRecords,
        long totalDlqPublishedRecords,
        long totalDlqPublishFailureRecords,
        long totalDbFailureRecords,
        long totalSuccessfulBatches,
        long totalFailedBatches,
        Long lastSuccessAtMs,
        Long lastErrorAtMs,
        String lastErrorMessage,
        AggTradeRawWriterKafkaTelemetrySummary summary,
        java.util.List<AggTradeRawWriterKafkaFailureSample> recentFailures,
        AggTradeRawWriterKafkaTopicSnapshot rawTopic,
        AggTradeRawWriterKafkaTopicSnapshot dlqTopic
) {
}
