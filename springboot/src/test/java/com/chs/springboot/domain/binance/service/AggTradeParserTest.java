package com.chs.springboot.domain.binance.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class AggTradeParserTest {

    private AggTradeParser parser;

    @BeforeEach
    void setUp() {
        parser = new AggTradeParser(new ObjectMapper());
    }

    @Test
    @DisplayName("payload JSON: rawJson 그대로 유지하고 필드 파싱")
    void parse_payloadJson_extractsFields() {
        String json = "{\"a\":123,\"p\":\"50000.5\",\"q\":\"0.01\",\"m\":true,\"T\":1700000000}";

        AggTradeEvent event = parser.parse(json, "BTCUSDT", "SPOT", 999L);

        assertThat(event.symbol()).isEqualTo("BTCUSDT");
        assertThat(event.marketType()).isEqualTo("SPOT");
        assertThat(event.receivedAt()).isEqualTo(999L);
        assertThat(event.rawJson()).isEqualTo(json);
        assertThat(event.hasParsed()).isTrue();
        assertThat(event.parsed().aggId()).isEqualTo(123L);
        assertThat(event.parsed().price()).isEqualTo("50000.5");
        assertThat(event.parsed().quantity()).isEqualTo("0.01");
        assertThat(event.parsed().isBuyerMaker()).isTrue();
        assertThat(event.parsed().tradedAt()).isEqualTo(1700000000L);
    }

    @Test
    @DisplayName("envelope JSON: data 필드를 벗겨 rawJson에 저장")
    void parse_envelopeJson_unwrapsData() {
        String envelope = "{\"stream\":\"btcusdt@aggTrade\",\"data\":{\"a\":1,\"p\":\"1\",\"q\":\"1\",\"m\":false,\"T\":1}}";

        AggTradeEvent event = parser.parse(envelope, "BTCUSDT", "FUTURES", 1L);

        assertThat(event.rawJson()).contains("\"a\":1").doesNotContain("\"stream\"");
        assertThat(event.hasParsed()).isTrue();
    }

    @Test
    @DisplayName("깨진 JSON: rawJson은 원본 유지, parsed는 null")
    void parse_brokenJson_keepsRawAndNullParsed() {
        String broken = "this-is-not-json";

        AggTradeEvent event = parser.parse(broken, "BTCUSDT", "SPOT", 1L);

        assertThat(event.rawJson()).isEqualTo(broken);
        assertThat(event.hasParsed()).isFalse();
        assertThat(event.parsed()).isNull();
    }

    @Test
    @DisplayName("필드 일부 누락: parsed는 null")
    void parse_missingFields_nullParsed() {
        String partial = "{\"a\":1,\"p\":\"1\"}";

        AggTradeEvent event = parser.parse(partial, "BTCUSDT", "SPOT", 1L);

        assertThat(event.hasParsed()).isFalse();
    }
}
