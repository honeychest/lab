package com.chs.springboot.domain.binance.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

@Component
public class AggTradeParser {

    private static final Logger log = LoggerFactory.getLogger(AggTradeParser.class);

    private final ObjectMapper objectMapper;

    public AggTradeParser(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    public AggTradeEvent parse(String rawJson, String symbol, String marketType, long receivedAt) {
        String payloadJson = unwrapEnvelope(rawJson);
        AggTradeEvent.AggTradeFields fields = tryParseFields(payloadJson, symbol, marketType);
        return new AggTradeEvent(symbol, marketType, receivedAt, payloadJson, fields);
    }

    private String unwrapEnvelope(String rawJson) {
        try {
            JsonNode root = objectMapper.readTree(rawJson);
            if (root.has("data")) {
                return root.get("data").toString();
            }
        } catch (Exception ignore) {
        }
        return rawJson;
    }

    private AggTradeEvent.AggTradeFields tryParseFields(String payloadJson, String symbol, String marketType) {
        try {
            JsonNode node = objectMapper.readTree(payloadJson);
            return new AggTradeEvent.AggTradeFields(
                    node.get("a").asLong(),
                    node.get("p").asText(),
                    node.get("q").asText(),
                    node.get("m").asBoolean(),
                    node.get("T").asLong()
            );
        } catch (Exception e) {
            log.warn("[AggTradeParser] 필드 파싱 실패 {} {} error={}", symbol, marketType, e.getMessage());
            return null;
        }
    }
}
