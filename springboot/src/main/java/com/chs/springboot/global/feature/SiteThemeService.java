package com.chs.springboot.global.feature;

import lombok.RequiredArgsConstructor;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

import java.util.LinkedHashMap;
import java.util.Map;

@Service
@RequiredArgsConstructor
public class SiteThemeService {

    private static final String PREFIX = "theme:";
    private static final String DEFAULT_THEME = "dark";

    /** 현재 지원하는 페이지 키 목록 — 페이지 추가 시 여기만 확장 */
    private static final Map<String, String> PAGE_DEFAULTS = Map.of(
            "analysis", DEFAULT_THEME,
            "binance", DEFAULT_THEME,
            "trade", DEFAULT_THEME,
            "signal", "black"
    );

    private final StringRedisTemplate redisTemplate;

    public Map<String, String> getAll() {
        Map<String, String> result = new LinkedHashMap<>();
        for (Map.Entry<String, String> entry : PAGE_DEFAULTS.entrySet()) {
            String page = entry.getKey();
            String defaultValue = entry.getValue();
            result.put(page, getTheme(page, defaultValue));
        }
        return result;
    }

    public String getTheme(String page, String defaultValue) {
        try {
            String value = redisTemplate.opsForValue().get(PREFIX + page);
            return value != null ? value : defaultValue;
        } catch (Exception e) {
            return defaultValue;
        }
    }

    public void setTheme(String page, String theme) {
        if (page == null || theme == null) return;
        if (!PAGE_DEFAULTS.containsKey(page)) return;
        redisTemplate.opsForValue().set(PREFIX + page, theme);
    }
}
