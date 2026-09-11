package com.chs.springboot.domain.binance.autotrade.service;

import com.chs.springboot.domain.binance.autotrade.model.AutoTradePriceTick;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.math.BigDecimal;

public final class AutoTradeLastPriceParser {

    private AutoTradeLastPriceParser() {
    }

    public static AutoTradePriceTick parse(String json, ObjectMapper objectMapper) {
        try {
            JsonNode root = objectMapper.readTree(json);
            if (!"trade".equals(root.path("e").asText())) {
                throw new IllegalArgumentException("선물 체결 이벤트가 아닙니다");
            }
            return new AutoTradePriceTick(
                    new BigDecimal(root.path("p").asText()),
                    root.path("T").asLong()
            );
        } catch (Exception e) {
            throw new IllegalArgumentException("선물 체결 가격 이벤트를 해석할 수 없습니다", e);
        }
    }
}
