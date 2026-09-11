package com.chs.springboot.domain.binance.autotrade.service;

import com.chs.springboot.domain.binance.autotrade.model.AutoTradeBookTicker;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.math.BigDecimal;

public final class AutoTradeBookTickerParser {

    private AutoTradeBookTickerParser() {
    }

    public static AutoTradeBookTicker parse(String json, ObjectMapper objectMapper) {
        try {
            JsonNode root = objectMapper.readTree(json);
            if (!"bookTicker".equals(root.path("e").asText())) {
                throw new IllegalArgumentException("선물 호가 이벤트가 아닙니다");
            }
            return new AutoTradeBookTicker(
                    root.path("s").asText(),
                    new BigDecimal(root.path("b").asText()),
                    new BigDecimal(root.path("a").asText()),
                    root.path("E").asLong(root.path("T").asLong())
            );
        } catch (Exception e) {
            throw new IllegalArgumentException("선물 호가 이벤트를 해석할 수 없습니다", e);
        }
    }
}
