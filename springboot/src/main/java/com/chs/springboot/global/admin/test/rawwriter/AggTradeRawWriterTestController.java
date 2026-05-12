package com.chs.springboot.global.admin.test.rawwriter;

import com.chs.springboot.domain.binance.service.rawwriter.AggTradeRawWriterSummaryResponse;
import com.chs.springboot.domain.binance.service.rawwriter.AggTradeRawWriterDryRunVerifier;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequiredArgsConstructor
@RequestMapping("/api/admin/test/agg-trade/raw-writer")
public class AggTradeRawWriterTestController {

    private final AggTradeRawWriterDryRunVerifier dryRunVerifier;

    @GetMapping("/dry-run-summaries")
    public AggTradeRawWriterSummaryResponse dryRunSummaries() {
        return dryRunVerifier.snapshot();
    }
}
