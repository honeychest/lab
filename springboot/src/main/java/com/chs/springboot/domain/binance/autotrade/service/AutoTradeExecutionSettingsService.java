package com.chs.springboot.domain.binance.autotrade.service;

import com.chs.springboot.domain.binance.autotrade.model.AutoTradeExecutionMode;
import com.chs.springboot.domain.binance.autotrade.model.AutoTradeExecutionPolicy;
import com.chs.springboot.domain.binance.autotrade.model.AutoTradeExecutionSettings;
import com.chs.springboot.global.config.service.AppConfigService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.HashMap;
import java.util.Map;

@Service
@RequiredArgsConstructor
public class AutoTradeExecutionSettingsService {

    private static final long CACHE_TTL_MS = 500L;
    private static final String PREFIX = "config:binance:autotrade:execution:";
    private static final Map<String, String> DEFAULTS = Map.of(
            "mode", "OFF",
            "policy", "MANUAL",
            "poll-interval-ms", "1000",
            "account-refresh-interval-ms", "3000",
            "entry-analysis-interval-ms", "300000",
            "order-cooldown-ms", "3000"
    );

    private final AppConfigService appConfigService;
    private volatile AutoTradeExecutionSettings cached;
    private volatile long cachedAtMs;

    public AutoTradeExecutionSettings current() {
        long now = System.currentTimeMillis();
        AutoTradeExecutionSettings current = cached;
        if (current != null && now - cachedAtMs < CACHE_TTL_MS) {
            return current;
        }
        synchronized (this) {
            now = System.currentTimeMillis();
            current = cached;
            if (current == null || now - cachedAtMs >= CACHE_TTL_MS) {
                current = readCurrent();
                cached = current;
                cachedAtMs = now;
            }
            return current;
        }
    }

    private AutoTradeExecutionSettings readCurrent() {
        Map<String, String> values = rawValues();
        return new AutoTradeExecutionSettings(
                enumValue(values.get("mode")),
                policyValue(values.get("policy")),
                longValue(values, "poll-interval-ms"),
                longValue(values, "account-refresh-interval-ms"),
                longValue(values, "entry-analysis-interval-ms"),
                longValue(values, "order-cooldown-ms")
        );
    }

    public Map<String, Object> view() {
        AutoTradeExecutionSettings settings = current();
        return Map.of(
                "mode", settings.mode(),
                "policy", settings.policy(),
                "pollIntervalMs", settings.pollIntervalMs(),
                "accountRefreshIntervalMs", settings.accountRefreshIntervalMs(),
                "entryAnalysisIntervalMs", settings.entryAnalysisIntervalMs(),
                "orderCooldownMs", settings.orderCooldownMs()
        );
    }

    public void update(Map<String, String> updates) {
        if (updates == null || updates.isEmpty()) {
            throw new IllegalArgumentException("변경할 자동매매 실행 설정이 없습니다");
        }
        Map<String, String> candidate = rawValues();
        updates.forEach((key, value) -> {
            if (!DEFAULTS.containsKey(key)) {
                throw new IllegalArgumentException("알 수 없는 자동매매 실행 설정입니다: " + key);
            }
            if (value == null || value.isBlank()) {
                throw new IllegalArgumentException("자동매매 실행 설정값은 비어 있을 수 없습니다: " + key);
            }
            candidate.put(key, value.trim());
        });
        AutoTradeExecutionSettings validated = toSettings(candidate);
        updates.forEach((key, value) -> appConfigService.set(PREFIX + key, value.trim()));
        cached = validated;
        cachedAtMs = System.currentTimeMillis();
    }

    private Map<String, String> rawValues() {
        Map<String, String> values = new HashMap<>();
        DEFAULTS.keySet().forEach(key -> values.put(key, value(key)));
        return values;
    }

    private AutoTradeExecutionSettings toSettings(Map<String, String> values) {
        return new AutoTradeExecutionSettings(
                enumValue(values.get("mode")),
                policyValue(values.get("policy")),
                longValue(values, "poll-interval-ms"),
                longValue(values, "account-refresh-interval-ms"),
                longValue(values, "entry-analysis-interval-ms"),
                longValue(values, "order-cooldown-ms")
        );
    }

    private String value(String key) {
        String value = appConfigService.get(PREFIX + key);
        return value == null || value.isBlank() ? DEFAULTS.get(key) : value.trim();
    }

    private long longValue(Map<String, String> values, String key) {
        try {
            return Long.parseLong(values.get(key));
        } catch (NumberFormatException e) {
            throw new IllegalStateException("자동매매 실행 설정 정수가 올바르지 않습니다: " + key, e);
        }
    }

    private AutoTradeExecutionMode enumValue(String value) {
        try {
            return AutoTradeExecutionMode.valueOf(value.toUpperCase());
        } catch (IllegalArgumentException e) {
            throw new IllegalStateException("자동매매 실행 모드가 올바르지 않습니다", e);
        }
    }

    private AutoTradeExecutionPolicy policyValue(String value) {
        try {
            return AutoTradeExecutionPolicy.valueOf(value.toUpperCase());
        } catch (IllegalArgumentException e) {
            throw new IllegalStateException("자동매매 실행 방식이 올바르지 않습니다", e);
        }
    }

}
