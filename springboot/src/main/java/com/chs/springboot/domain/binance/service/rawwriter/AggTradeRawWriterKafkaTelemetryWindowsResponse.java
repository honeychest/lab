package com.chs.springboot.domain.binance.service.rawwriter;

import java.util.List;

public record AggTradeRawWriterKafkaTelemetryWindowsResponse(
        int minutes,
        int bucketSeconds,
        List<AggTradeRawWriterKafkaTelemetryWindow> windows
) {
}
