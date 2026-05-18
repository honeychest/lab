package com.chs.springboot.domain.binance.service.rawwriter;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.NavigableMap;
import java.util.TreeMap;

final class AggTradeRawWriterTelemetryBucketStore {

    private final long baseBucketMs;
    private final long retentionMs;
    private final NavigableMap<Long, WindowAccumulator> buckets = new TreeMap<>();

    AggTradeRawWriterTelemetryBucketStore(long baseBucketMs, long retentionMs) {
        this.baseBucketMs = baseBucketMs;
        this.retentionMs = retentionMs;
    }

    void recordConsumed(long now, int count) {
        bucket(now).consumedRecords += count;
        cleanup(now);
    }

    void recordWriteSuccess(long now, int count) {
        WindowAccumulator bucket = bucket(now);
        bucket.writeSuccessRecords += count;
        bucket.successfulBatches += 1;
        cleanup(now);
    }

    void recordInvalid(long now) {
        bucket(now).invalidRecords += 1;
        cleanup(now);
    }

    void recordDlqPublished(long now) {
        bucket(now).dlqPublishedRecords += 1;
        cleanup(now);
    }

    void recordDlqPublishFailure(long now) {
        WindowAccumulator bucket = bucket(now);
        bucket.dlqPublishFailureRecords += 1;
        bucket.failedBatches += 1;
        cleanup(now);
    }

    void recordDbFailure(long now, int count) {
        WindowAccumulator bucket = bucket(now);
        bucket.dbFailureRecords += count;
        bucket.failedBatches += 1;
        cleanup(now);
    }

    void recordRetrySuccess(long now, int count) {
        bucket(now).retrySuccessRecords += count;
        cleanup(now);
    }

    void recordFailedBatch(long now) {
        bucket(now).failedBatches += 1;
        cleanup(now);
    }

    List<AggTradeRawWriterKafkaTelemetryWindow> windows(long now, int minutes, int bucketSeconds) {
        cleanup(now);
        long bucketMs = Math.max(60, bucketSeconds) * 1000L;
        long fromMs = now - (minutes * 60_000L);
        Map<Long, WindowAccumulator> merged = new LinkedHashMap<>();
        for (Map.Entry<Long, WindowAccumulator> entry : buckets.tailMap(fromMs, true).entrySet()) {
            long bucketStart = KafkaWindow.startOf(entry.getKey(), bucketMs);
            merged.computeIfAbsent(bucketStart, ignored -> new WindowAccumulator()).merge(entry.getValue());
        }
        return merged.entrySet().stream()
                .sorted(Map.Entry.comparingByKey())
                .map(entry -> entry.getValue().toWindow(entry.getKey(), entry.getKey() + bucketMs))
                .toList();
    }

    AggTradeRawWriterKafkaTelemetrySummary summarize() {
        AggTradeRawWriterKafkaTelemetryWindow worstWindow = null;
        long worstScore = Long.MIN_VALUE;
        long peakConsumed = 0L;
        long peakInvalid = 0L;
        long peakDlqPublished = 0L;
        long peakDbFailure = 0L;
        long peakRetrySuccess = 0L;
        long peakFailedBatches = 0L;
        for (Map.Entry<Long, WindowAccumulator> entry : buckets.entrySet()) {
            AggTradeRawWriterKafkaTelemetryWindow window = entry.getValue().toWindow(
                    entry.getKey(),
                    entry.getKey() + baseBucketMs
            );
            peakConsumed = Math.max(peakConsumed, window.consumedRecords());
            peakInvalid = Math.max(peakInvalid, window.invalidRecords());
            peakDlqPublished = Math.max(peakDlqPublished, window.dlqPublishedRecords());
            peakDbFailure = Math.max(peakDbFailure, window.dbFailureRecords());
            peakRetrySuccess = Math.max(peakRetrySuccess, window.retrySuccessRecords());
            peakFailedBatches = Math.max(peakFailedBatches, window.failedBatches());
            long score = (window.failedBatches() * 1_000_000L)
                    + (window.dbFailureRecords() * 10_000L)
                    + (window.dlqPublishFailureRecords() * 10_000L)
                    + (window.invalidRecords() * 100L)
                    + window.dlqPublishedRecords();
            if (score > worstScore && score > 0) {
                worstScore = score;
                worstWindow = window;
            }
        }
        return new AggTradeRawWriterKafkaTelemetrySummary(
                worstWindow,
                peakConsumed,
                peakInvalid,
                peakDlqPublished,
                peakDbFailure,
                peakRetrySuccess,
                peakFailedBatches
        );
    }

    private WindowAccumulator bucket(long now) {
        long bucketStart = KafkaWindow.startOf(now, baseBucketMs);
        return buckets.computeIfAbsent(bucketStart, ignored -> new WindowAccumulator());
    }

    private void cleanup(long now) {
        long threshold = now - retentionMs;
        buckets.headMap(threshold, false).clear();
    }

    private static final class WindowAccumulator {
        private long consumedRecords;
        private long writeSuccessRecords;
        private long invalidRecords;
        private long dlqPublishedRecords;
        private long dlqPublishFailureRecords;
        private long dbFailureRecords;
        private long retrySuccessRecords;
        private long successfulBatches;
        private long failedBatches;

        private void merge(WindowAccumulator other) {
            this.consumedRecords += other.consumedRecords;
            this.writeSuccessRecords += other.writeSuccessRecords;
            this.invalidRecords += other.invalidRecords;
            this.dlqPublishedRecords += other.dlqPublishedRecords;
            this.dlqPublishFailureRecords += other.dlqPublishFailureRecords;
            this.dbFailureRecords += other.dbFailureRecords;
            this.retrySuccessRecords += other.retrySuccessRecords;
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
                    retrySuccessRecords,
                    successfulBatches,
                    failedBatches
            );
        }
    }
}
