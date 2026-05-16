package com.chs.springboot.domain.binance.service.rawwriter;

import com.chs.springboot.domain.binance.model.RawAggTrade;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;

@Component
public class AggTradeRawWriterMessageParser {

    private final ObjectMapper objectMapper;

    public AggTradeRawWriterMessageParser(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    public AggTradeRawWriterParsedMessage parse(AggTradeRawWriterMessage message) {
        try {
            JsonNode envelope = objectMapper.readTree(message.value());
            String symbol = requiredText(envelope, "symbol");
            String marketType = requiredText(envelope, "marketType");
            JsonNode payload = envelope.get("payload");
            if (payload == null || !payload.isObject()) {
                throw invalid("Missing payload");
            }
            AggTradeRecordKey.validateNullable(message.key(), symbol, marketType);

            RawAggTrade trade = new RawAggTrade();
            trade.setSymbol(symbol);
            trade.setMarketType(marketType);
            trade.setAggTradeId(requiredPositiveLong(payload, "a"));
            trade.setPrice(requiredPositiveDecimal(payload, "p"));
            trade.setQuantity(requiredPositiveDecimal(payload, "q"));
            trade.setFirstTradeId(requiredLong(payload, "f"));
            trade.setLastTradeId(requiredLong(payload, "l"));
            trade.setIsBuyerMaker(requiredBoolean(payload, "m"));
            trade.setTradedAt(requiredPositiveLong(payload, "T"));
            return new AggTradeRawWriterParsedMessage(message, trade);
        } catch (InvalidAggTradeRawMessageException e) {
            throw e;
        } catch (Exception e) {
            throw new InvalidAggTradeRawMessageException("Invalid aggTrade raw message", e);
        }
    }

    private String requiredText(JsonNode node, String field) {
        JsonNode value = node.get(field);
        if (value == null || value.asText().isBlank()) {
            throw invalid("Missing " + field);
        }
        return value.asText();
    }

    private long requiredLong(JsonNode node, String field) {
        JsonNode value = node.get(field);
        if (value == null || !value.canConvertToLong()) {
            throw invalid("Missing " + field);
        }
        return value.asLong();
    }

    private long requiredPositiveLong(JsonNode node, String field) {
        long value = requiredLong(node, field);
        if (value <= 0) {
            throw invalid(field + " must be positive");
        }
        return value;
    }

    private BigDecimal requiredPositiveDecimal(JsonNode node, String field) {
        JsonNode value = node.get(field);
        if (value == null || value.asText().isBlank()) {
            throw invalid("Missing " + field);
        }
        BigDecimal decimal;
        try {
            decimal = new BigDecimal(value.asText());
        } catch (NumberFormatException e) {
            throw invalid(field + " must be decimal");
        }
        if (decimal.signum() <= 0) {
            throw invalid(field + " must be positive");
        }
        return decimal;
    }

    private boolean requiredBoolean(JsonNode node, String field) {
        JsonNode value = node.get(field);
        if (value == null || !value.isBoolean()) {
            throw invalid("Missing " + field);
        }
        return value.asBoolean();
    }

    private InvalidAggTradeRawMessageException invalid(String message) {
        return new InvalidAggTradeRawMessageException(message);
    }
}
