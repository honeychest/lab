package com.chs.springboot.domain.binance.service.rawwriter;

public record AggTradeRawWriterKafkaTelemetryWindow(
        long bucketStartMs,
        long bucketEndMs,
        long consumedRecords,
        long writeSuccessRecords,
        long invalidRecords,
        long dlqPublishedRecords,
        long dlqPublishFailureRecords,
        long dbFailureRecords,
        long successfulBatches,
        long failedBatches
) {
}
