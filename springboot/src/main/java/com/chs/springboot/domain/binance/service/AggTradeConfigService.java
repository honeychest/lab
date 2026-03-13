// [AGENT] 역할: aggTrade 수집 설정 관리 (Redis 우선, fallback @Value) | 연관파일: AggTradeStorageService.java, AggTradeFlushScheduler.java, AggTradeBackfillService.java, AggTradeAdminController.java | 설정키: max-queue-size·flush-threshold·batch-size·flush-interval-sec·dedup-ttl-sec·weight-per-minute | 핵심: Redis에 값 있으면 사용, 없으면 application.properties 기본값
package com.chs.springboot.domain.binance.service;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

@Service
public class AggTradeConfigService {

    private static final String KEY_MAX_QUEUE_SIZE = "config:aggtrade:max-queue-size";
    private static final String KEY_FLUSH_THRESHOLD = "config:aggtrade:flush-threshold";
    private static final String KEY_BATCH_SIZE = "config:aggtrade:batch-size";
    private static final String KEY_FLUSH_INTERVAL_SEC = "config:aggtrade:flush-interval-sec";
    private static final String KEY_DEDUP_TTL_SEC = "config:aggtrade:dedup-ttl-sec";
    private static final String KEY_WEIGHT_PER_MINUTE = "config:aggtrade:weight-per-minute";

    private final StringRedisTemplate redisTemplate;

    @Value("${binance.agg-trade.max-queue-size:200000}")
    private int defaultMaxQueueSize;

    @Value("${binance.agg-trade.flush-threshold:20000}")
    private int defaultFlushThreshold;

    @Value("${binance.agg-trade.batch-size:10000}")
    private int defaultBatchSize;

    @Value("${binance.agg-trade.flush-interval-sec:10}")
    private int defaultFlushIntervalSec;

    @Value("${binance.agg-trade.dedup-ttl-sec:60}")
    private int defaultDedupTtlSec;

    @Value("${binance.agg-trade.weight-per-minute:1200}")
    private int defaultWeightPerMinute;

    public AggTradeConfigService(StringRedisTemplate redisTemplate) {
        this.redisTemplate = redisTemplate;
    }

    public int getMaxQueueSize() {
        return getIntOrDefault(KEY_MAX_QUEUE_SIZE, defaultMaxQueueSize);
    }

    public int getFlushThreshold() {
        return getIntOrDefault(KEY_FLUSH_THRESHOLD, defaultFlushThreshold);
    }

    public int getBatchSize() {
        return getIntOrDefault(KEY_BATCH_SIZE, defaultBatchSize);
    }

    public int getFlushIntervalSec() {
        return getIntOrDefault(KEY_FLUSH_INTERVAL_SEC, defaultFlushIntervalSec);
    }

    public int getDedupTtlSec() {
        return getIntOrDefault(KEY_DEDUP_TTL_SEC, defaultDedupTtlSec);
    }

    public int getWeightPerMinute() {
        return getIntOrDefault(KEY_WEIGHT_PER_MINUTE, defaultWeightPerMinute);
    }

    public void updateMaxQueueSize(int value) {
        setInt(KEY_MAX_QUEUE_SIZE, value);
    }

    public void updateFlushThreshold(int value) {
        setInt(KEY_FLUSH_THRESHOLD, value);
    }

    public void updateBatchSize(int value) {
        setInt(KEY_BATCH_SIZE, value);
    }

    public void updateFlushIntervalSec(int value) {
        setInt(KEY_FLUSH_INTERVAL_SEC, value);
    }

    public void updateDedupTtlSec(int value) {
        setInt(KEY_DEDUP_TTL_SEC, value);
    }

    public void updateWeightPerMinute(int value) {
        setInt(KEY_WEIGHT_PER_MINUTE, value);
    }

    private int getIntOrDefault(String key, int defaultValue) {
        try {
            String value = redisTemplate.opsForValue().get(key);
            if (value == null) {
                return defaultValue;
            }
            return Integer.parseInt(value);
        } catch (Exception e) {
            return defaultValue;
        }
    }

    private void setInt(String key, int value) {
        redisTemplate.opsForValue().set(key, Integer.toString(value));
    }
}

