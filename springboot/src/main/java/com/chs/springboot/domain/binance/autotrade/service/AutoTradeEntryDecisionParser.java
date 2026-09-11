package com.chs.springboot.domain.binance.autotrade.service;

import com.chs.springboot.domain.binance.autotrade.model.AutoTradeEntryDecision;
import com.chs.springboot.domain.binance.autotrade.model.AutoTradeSide;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

public final class AutoTradeEntryDecisionParser {

    private AutoTradeEntryDecisionParser() {
    }

    public static AutoTradeEntryDecision parse(String content, ObjectMapper objectMapper) {
        if (content == null || content.isBlank()) {
            return AutoTradeEntryDecision.noTrade("LLM 응답이 비어 있습니다");
        }
        try {
            JsonNode root = objectMapper.readTree(extractJson(content));
            AutoTradeSide side = AutoTradeSide.valueOf(root.path("side").asText().toUpperCase());
            if (side == AutoTradeSide.NONE) {
                return AutoTradeEntryDecision.noTrade(root.path("reason").asText("LLM이 진입하지 않기로 했습니다"));
            }
            return new AutoTradeEntryDecision(side, root.path("reason").asText("LLM 진입 판단"));
        } catch (Exception e) {
            return AutoTradeEntryDecision.noTrade("LLM 진입 판단 형식이 올바르지 않습니다");
        }
    }

    private static String extractJson(String content) {
        String trimmed = content.trim();
        if (trimmed.startsWith("```") && trimmed.endsWith("```")) {
            int firstLineEnd = trimmed.indexOf('\n');
            if (firstLineEnd >= 0) {
                return trimmed.substring(firstLineEnd + 1, trimmed.length() - 3).trim();
            }
        }
        int start = trimmed.indexOf('{');
        int end = trimmed.lastIndexOf('}');
        if (start >= 0 && end > start) {
            return trimmed.substring(start, end + 1);
        }
        return trimmed;
    }
}
