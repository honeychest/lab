// [AGENT] 앱 설정 서비스 — DB 원본, Redis 캐시, 시작 시 기본값 초기화                                                                       
package com.chs.springboot.global.config.service;

import com.chs.springboot.global.config.entity.AppConfig;
import com.chs.springboot.global.config.repository.AppConfigRepository;
import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

import java.util.Map;

@Slf4j
@Service
@RequiredArgsConstructor
public class AppConfigService {

    private final AppConfigRepository appConfigRepository;
    private final StringRedisTemplate redisTemplate;

    private static final Map<String, String> DEFAULTS = Map.of(
            "config:aggtrade:max-queue-size",   "200000",
            "config:aggtrade:flush-threshold",  "20000",
            "config:aggtrade:batch-size",        "10000",
            "config:aggtrade:flush-interval-sec","10",
            "config:aggtrade:dedup-ttl-sec",     "60",
            "config:aggtrade:weight-per-minute", "1200",
            "config:threshold",                  "100000"
    );

    @PostConstruct
    public void init() {
        for (Map.Entry<String, String> entry : DEFAULTS.entrySet()) {
            String key = entry.getKey();
            String defaultValue = entry.getValue();

            appConfigRepository.findByConfigKey(key).ifPresentOrElse(
                    existing -> log.info("[AppConfig] DB 기존값 유지: {}={}", key, existing.getConfigValue()),
                    () -> {
                        AppConfig config = new AppConfig();
                        config.setConfigKey(key);
                        config.setConfigValue(defaultValue);
                        appConfigRepository.save(config);
                        log.info("[AppConfig] DB 기본값 초기화: {}={}", key, defaultValue);
                    }
            );
        }
    }

    public String get(String key) {
        // Redis 우선
        try {
            String val = redisTemplate.opsForValue().get(key);
            if (val != null) return val;
        } catch (Exception e) {
            log.warn("[AppConfig] Redis 조회 실패: {}", e.getMessage());
        }
        // DB fallback
        return appConfigRepository.findByConfigKey(key)
                .map(AppConfig::getConfigValue)
                .orElse(null);
    }

    public void set(String key, String value) {
        // Redis 저장
        redisTemplate.opsForValue().set(key, value);
        // DB 동기화
        AppConfig config = appConfigRepository.findByConfigKey(key)
                .orElseGet(() -> {
                    AppConfig c = new AppConfig();
                    c.setConfigKey(key);
                    return c;
                });
        config.setConfigValue(value);
        appConfigRepository.save(config);
    }
}