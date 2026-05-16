package com.chs.springboot.global.admin.test.rawwriter;

import com.chs.springboot.domain.binance.service.rawwriter.AggTradeRawWriterSummaryResponse;
import com.chs.springboot.domain.binance.service.rawwriter.AggTradeRawWriterDryRunVerifier;
import com.chs.springboot.domain.binance.service.rawwriter.AggTradeRawWriterShadowCompareResponse;
import com.chs.springboot.domain.binance.service.rawwriter.AggTradeRawWriterShadowVerifier;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequiredArgsConstructor
@RequestMapping("/api/admin/test/agg-trade/raw-writer")
public class AggTradeRawWriterTestController {

    private final AggTradeRawWriterDryRunVerifier dryRunVerifier;
    private final AggTradeRawWriterShadowVerifier shadowVerifier;

    @GetMapping("/dry-run-summaries")
    public AggTradeRawWriterSummaryResponse dryRunSummaries() {
        return dryRunVerifier.snapshot();
    }

    @GetMapping("/shadow-comparison")
    public AggTradeRawWriterShadowCompareResponse shadowComparison(
            @RequestParam(defaultValue = "60") int minutes
    ) {
        return shadowVerifier.compareRecent(minutes);
    }
}
