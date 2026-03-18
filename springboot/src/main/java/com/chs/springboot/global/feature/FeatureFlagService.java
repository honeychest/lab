package com.chs.springboot.global.feature;

import lombok.RequiredArgsConstructor;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

import java.util.Map;

@Service
@RequiredArgsConstructor
public class FeatureFlagService {

    public static final String KEY_TRADE_THRESHOLD_EDIT = "feature:trade:threshold-edit";
    public static final String KEY_MONITOR_ALLOWED_IP_MANAGE = "feature:monitor:allowed-ip-manage";

    private final StringRedisTemplate redisTemplate;

    public Map<String, Boolean> getAll() {
        return Map.of(
                "tradeThresholdEdit", isEnabled(KEY_TRADE_THRESHOLD_EDIT, true),
                "monitorAllowedIpManage", isEnabled(KEY_MONITOR_ALLOWED_IP_MANAGE, false)
        );
    }

    public boolean isTradeThresholdEditEnabled() {
        return isEnabled(KEY_TRADE_THRESHOLD_EDIT, true);
    }

    public boolean isMonitorAllowedIpManageEnabled() {
        return isEnabled(KEY_MONITOR_ALLOWED_IP_MANAGE, false);
    }

    public void setTradeThresholdEdit(Boolean enabled) {
        if (enabled == null) return;
        set(KEY_TRADE_THRESHOLD_EDIT, enabled);
    }

    public void setMonitorAllowedIpManage(Boolean enabled) {
        if (enabled == null) return;
        set(KEY_MONITOR_ALLOWED_IP_MANAGE, enabled);
    }

    private boolean isEnabled(String key, boolean defaultValue) {
        try {
            String v = redisTemplate.opsForValue().get(key);
            if (v == null) return defaultValue;
            return "ON".equalsIgnoreCase(v) || "TRUE".equalsIgnoreCase(v) || "1".equals(v);
        } catch (Exception e) {
            return defaultValue;
        }
    }

    private void set(String key, boolean enabled) {
        redisTemplate.opsForValue().set(key, enabled ? "ON" : "OFF");
    }
}

