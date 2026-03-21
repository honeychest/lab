// [AGENT] 역할: aggTrade 수집 설정 관리 (AppConfigService 위임 — Redis 우선, DB fallback) | 연관파일: AggTradeStorageService.java,
//  AggTradeFlushScheduler.java, AggTradeBackfillService.java, AggTradeAdminController.java | 설정키: max-queue-size·flush-threshold·batch-size·flush-interval-sec·dedup-ttl-sec·weight-per-minute
package com.chs.springboot.domain.binance.service;

import com.chs.springboot.global.config.service.AppConfigService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class AggTradeConfigService {

    private static final String KEY_MAX_QUEUE_SIZE    = "config:aggtrade:max-queue-size";
    private static final String KEY_FLUSH_THRESHOLD   = "config:aggtrade:flush-threshold";
    private static final String KEY_BATCH_SIZE        = "config:aggtrade:batch-size";
    private static final String KEY_FLUSH_INTERVAL_SEC = "config:aggtrade:flush-interval-sec";
    private static final String KEY_DEDUP_TTL_SEC     = "config:aggtrade:dedup-ttl-sec";
    private static final String KEY_WEIGHT_PER_MINUTE = "config:aggtrade:weight-per-minute";

    private final AppConfigService appConfigService;

    public int getMaxQueueSize()    { return getInt(KEY_MAX_QUEUE_SIZE,     200000); }
    public int getFlushThreshold()  { return getInt(KEY_FLUSH_THRESHOLD,    20000);  }
    public int getBatchSize()       { return getInt(KEY_BATCH_SIZE,         10000);  }
    public int getFlushIntervalSec(){ return getInt(KEY_FLUSH_INTERVAL_SEC, 10);     }
    public int getDedupTtlSec()     { return getInt(KEY_DEDUP_TTL_SEC,      60);     }
    public int getWeightPerMinute() { return getInt(KEY_WEIGHT_PER_MINUTE,  1200);   }

    public void updateMaxQueueSize(int v)     { appConfigService.set(KEY_MAX_QUEUE_SIZE,     String.valueOf(v)); }
    public void updateFlushThreshold(int v)   { appConfigService.set(KEY_FLUSH_THRESHOLD,    String.valueOf(v)); }
    public void updateBatchSize(int v)        { appConfigService.set(KEY_BATCH_SIZE,          String.valueOf(v)); }
    public void updateFlushIntervalSec(int v) { appConfigService.set(KEY_FLUSH_INTERVAL_SEC, String.valueOf(v)); }
    public void updateDedupTtlSec(int v)      { appConfigService.set(KEY_DEDUP_TTL_SEC,      String.valueOf(v)); }
    public void updateWeightPerMinute(int v)  { appConfigService.set(KEY_WEIGHT_PER_MINUTE,  String.valueOf(v)); }

    private int getInt(String key, int fallback) {
        try {
            String val = appConfigService.get(key);
            if (val != null) return Integer.parseInt(val);
        } catch (Exception ignored) {}
        return fallback;
    }
}