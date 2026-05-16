package com.chs.springboot.domain.binance.service.rawwriter;

public record AggTradeRawWriterKafkaTelemetrySummary(
        AggTradeRawWriterKafkaTelemetryWindow worstWindow,
        long peakConsumedRecords,
        long peakInvalidRecords,
        long peakDlqPublishedRecords,
        long peakDbFailureRecords,
        long peakFailedBatches
) {
}
