package com.chs.springboot.domain.binance.service.rawwriter;

/**
 * Fixed-size epoch millisecond window.
 */
public record KafkaWindow(long startMs, long endMs) {

    public static final long RAW_WRITER_DRY_RUN_WINDOW_MS = 10_000L;
    public static final long TELEMETRY_BUCKET_MS = 60_000L;

    public static KafkaWindow of(long epochMs, long windowMs) {
        if (windowMs <= 0) {
            throw new IllegalArgumentException("windowMs must be positive");
        }
        long startMs = startOf(epochMs, windowMs);
        return new KafkaWindow(startMs, startMs + windowMs);
    }

    public static long startOf(long epochMs, long windowMs) {
        if (windowMs <= 0) {
            throw new IllegalArgumentException("windowMs must be positive");
        }
        return epochMs - Math.floorMod(epochMs, windowMs);
    }

    public KafkaWindow next() {
        long size = endMs - startMs;
        return new KafkaWindow(endMs, endMs + size);
    }
}
