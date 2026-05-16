package com.chs.springboot.domain.binance.service.rawwriter;

import java.util.List;

public record AggTradeRawWriterShadowCompareResponse(
        int minutes,
        List<AggTradeRawWriterShadowCompareRow> rows
) {
}
