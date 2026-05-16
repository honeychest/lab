package com.chs.springboot.domain.binance.service.rawwriter;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class AggTradeRecordKeyTest {

    @Test
    void parseOrUnknownParsesSymbolAndMarketType() {
        AggTradeRecordKey key = AggTradeRecordKey.parseOrUnknown("BTCUSDT|FUTURES");

        assertThat(key.symbol()).isEqualTo("BTCUSDT");
        assertThat(key.marketType()).isEqualTo("FUTURES");
    }

    @Test
    void parseOrUnknownReturnsUnknownForInvalidKey() {
        assertThat(AggTradeRecordKey.parseOrUnknown(null).symbol()).isEqualTo("UNKNOWN");
        assertThat(AggTradeRecordKey.parseOrUnknown("").marketType()).isEqualTo("UNKNOWN");
        assertThat(AggTradeRecordKey.parseOrUnknown("BTCUSDT").symbol()).isEqualTo("UNKNOWN");
        assertThat(AggTradeRecordKey.parseOrUnknown("BTCUSDT|").marketType()).isEqualTo("UNKNOWN");
    }

    @Test
    void validateNullableAllowsBlankKeyButRejectsMismatch() {
        AggTradeRecordKey.validateNullable(null, "BTCUSDT", "FUTURES");
        AggTradeRecordKey.validateNullable("", "BTCUSDT", "FUTURES");
        AggTradeRecordKey.validateNullable("BTCUSDT|FUTURES", "BTCUSDT", "FUTURES");

        assertThatThrownBy(() -> AggTradeRecordKey.validateNullable("BTCUSDT|SPOT", "BTCUSDT", "FUTURES"))
                .isInstanceOf(InvalidAggTradeRawMessageException.class)
                .hasMessageContaining("Key mismatch");
    }
}
