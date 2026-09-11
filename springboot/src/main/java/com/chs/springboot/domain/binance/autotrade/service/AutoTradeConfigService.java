package com.chs.springboot.domain.binance.autotrade.service;

import com.chs.springboot.domain.binance.autotrade.model.AutoTradePositionMode;
import com.chs.springboot.domain.binance.autotrade.model.AutoTradePriceSource;
import com.chs.springboot.domain.binance.autotrade.model.AutoTradeStrategyConfig;
import com.chs.springboot.global.config.service.AppConfigService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.util.HashMap;
import java.util.Map;

@Service
@RequiredArgsConstructor
public class AutoTradeConfigService {

    private static final String PREFIX = "config:binance:autotrade:";
    private static final Map<String, String> DEFAULTS = Map.of(
            "symbol", "ENAUSDT",
            "base-notional", "5",
            "add-step-pct", "0.01",
            "take-profit-pct", "0.02",
            "stop-loss-pct", "0.02",
            "martingale-ratio", "2",
            "max-adds", "3",
            "position-mode", "ONE_WAY",
            "price-source", "LAST_PRICE"
    );

    private final AppConfigService appConfigService;

    public AutoTradeStrategyConfig current() {
        return toConfig(rawValues());
    }

    public Map<String, Object> view() {
        AutoTradeStrategyConfig config = current();
        return Map.of(
                "symbol", config.symbol(),
                "baseNotional", config.baseNotional(),
                "addStepPct", config.addStepPct(),
                "takeProfitPct", config.takeProfitPct(),
                "stopLossPct", config.stopLossPct(),
                "martingaleRatio", config.martingaleRatio(),
                "maxAdds", config.maxAdds(),
                "positionMode", config.positionMode(),
                "priceSource", config.priceSource()
        );
    }

    public void update(Map<String, String> updates) {
        if (updates == null || updates.isEmpty()) {
            throw new IllegalArgumentException("변경할 자동매매 설정이 없습니다");
        }
        Map<String, String> candidate = rawValues();
        updates.forEach((key, value) -> {
            if (!DEFAULTS.containsKey(key)) {
                throw new IllegalArgumentException("알 수 없는 자동매매 설정입니다: " + key);
            }
            if (value == null || value.isBlank()) {
                throw new IllegalArgumentException("자동매매 설정값은 비어 있을 수 없습니다: " + key);
            }
            candidate.put(key, value.trim());
        });
        toConfig(candidate);
        updates.forEach((key, value) -> appConfigService.set(PREFIX + key, value.trim()));
    }

    private Map<String, String> rawValues() {
        Map<String, String> values = new HashMap<>();
        DEFAULTS.keySet().forEach(key -> values.put(key, value(key)));
        return values;
    }

    private AutoTradeStrategyConfig toConfig(Map<String, String> values) {
        return new AutoTradeStrategyConfig(
                values.get("symbol"),
                decimal(values, "base-notional"),
                decimal(values, "add-step-pct"),
                decimal(values, "take-profit-pct"),
                decimal(values, "stop-loss-pct"),
                decimal(values, "martingale-ratio"),
                integer(values, "max-adds"),
                enumValue(values, "position-mode", AutoTradePositionMode.class),
                enumValue(values, "price-source", AutoTradePriceSource.class)
        );
    }

    private String value(String key) {
        String value = appConfigService.get(PREFIX + key);
        return value == null || value.isBlank() ? DEFAULTS.get(key) : value.trim();
    }

    private BigDecimal decimal(Map<String, String> values, String key) {
        try {
            return new BigDecimal(values.get(key));
        } catch (NumberFormatException e) {
            throw new IllegalStateException("자동매매 설정 숫자가 올바르지 않습니다: " + key, e);
        }
    }

    private int integer(Map<String, String> values, String key) {
        try {
            return Integer.parseInt(values.get(key));
        } catch (NumberFormatException e) {
            throw new IllegalStateException("자동매매 설정 정수가 올바르지 않습니다: " + key, e);
        }
    }

    private <T extends Enum<T>> T enumValue(Map<String, String> values, String key, Class<T> type) {
        try {
            return Enum.valueOf(type, values.get(key).toUpperCase());
        } catch (IllegalArgumentException e) {
            throw new IllegalStateException("자동매매 설정 값이 올바르지 않습니다: " + key, e);
        }
    }
}
