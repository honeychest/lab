package com.chs.springboot.domain.binance.autotrade.service;

import com.chs.springboot.domain.binance.autotrade.model.AutoTradeEntryDecision;
import com.chs.springboot.domain.binance.autotrade.model.AutoTradeSide;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class AutoTradeEntryDecisionParserTest {

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Test
    void parsesLongDecisionFromJson() {
        AutoTradeEntryDecision decision = AutoTradeEntryDecisionParser.parse(
                "{\"side\":\"LONG\",\"reason\":\"상위 시간봉 상승 구조\"}", objectMapper);

        assertThat(decision.side()).isEqualTo(AutoTradeSide.LONG);
        assertThat(decision.reason()).contains("상승");
    }

    @Test
    void invalidResponseFailsClosedToNoTrade() {
        AutoTradeEntryDecision decision = AutoTradeEntryDecisionParser.parse("not-json", objectMapper);

        assertThat(decision.side()).isEqualTo(AutoTradeSide.NONE);
    }
}
