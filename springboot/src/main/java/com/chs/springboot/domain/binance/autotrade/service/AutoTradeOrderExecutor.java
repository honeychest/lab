package com.chs.springboot.domain.binance.autotrade.service;

import com.chs.springboot.domain.binance.autotrade.model.AutoTradeExecutionMode;
import com.chs.springboot.domain.binance.autotrade.model.AutoTradeOrderRequest;
import com.chs.springboot.domain.binance.autotrade.model.AutoTradeOrderSubmission;
import com.chs.springboot.domain.binance.autotrade.model.AutoTradeOrderSubmissionKind;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

@Service
public class AutoTradeOrderExecutor {

    private final AutoTradeOrderExecutionRouter router;
    private final boolean liveEnabled;

    public AutoTradeOrderExecutor(
            AutoTradeOrderExecutionRouter router,
            @Value("${binance.autotrade.live-enabled:false}") boolean liveEnabled) {
        this.router = router;
        this.liveEnabled = liveEnabled;
    }

    public AutoTradeOrderSubmission execute(AutoTradeExecutionMode mode,
                                            AutoTradeOrderRequest request) {
        if (mode == AutoTradeExecutionMode.LIVE && !liveEnabled) {
            return new AutoTradeOrderSubmission(
                    AutoTradeOrderSubmissionKind.REJECTED,
                    request.action(),
                    request.clientOrderId(),
                    null,
                    "실거래는 binance.autotrade.live-enabled=true일 때만 허용됩니다"
            );
        }
        return router.execute(mode, request);
    }
}
