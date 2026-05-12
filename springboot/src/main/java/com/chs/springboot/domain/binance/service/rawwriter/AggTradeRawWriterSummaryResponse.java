package com.chs.springboot.domain.binance.service.rawwriter;

import java.util.List;

public record AggTradeRawWriterSummaryResponse(
        boolean enabled,
        boolean dryRun,
        List<AggTradeRawWriterDryRunSummary> summaries
) {
    public static AggTradeRawWriterSummaryResponse sampleComparedWindow() {
        return new AggTradeRawWriterSummaryResponse(
                true,
                true,
                List.of(new AggTradeRawWriterDryRunSummary(
                        "sample",
                        1778410000000L,
                        1778410010000L,
                        "BTCUSDT",
                        "SPOT",
                        412,
                        412,
                        100L,
                        511L,
                        100L,
                        511L,
                        1778410000100L,
                        1778410009800L,
                        1778410000100L,
                        1778410009800L,
                        0,
                        List.of(100L, 511L),
                        true,
                        true,
                        false,
                        "OK"
                ))
        );
    }
}
