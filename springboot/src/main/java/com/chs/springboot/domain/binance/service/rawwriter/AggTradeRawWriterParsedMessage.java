package com.chs.springboot.domain.binance.service.rawwriter;

import com.chs.springboot.domain.binance.model.RawAggTrade;

public record AggTradeRawWriterParsedMessage(
        AggTradeRawWriterMessage message,
        RawAggTrade trade
) {
}
