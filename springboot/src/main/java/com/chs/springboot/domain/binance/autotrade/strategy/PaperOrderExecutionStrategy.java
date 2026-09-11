package com.chs.springboot.domain.binance.autotrade.strategy;

import com.chs.springboot.domain.binance.autotrade.model.AutoTradeExecutionMode;
import com.chs.springboot.domain.binance.autotrade.model.AutoTradeOrderRequest;
import com.chs.springboot.domain.binance.autotrade.model.AutoTradeOrderSubmission;
import com.chs.springboot.domain.binance.autotrade.model.AutoTradeOrderSubmissionKind;
import org.springframework.stereotype.Component;

@Component
public class PaperOrderExecutionStrategy implements AutoTradeOrderExecutionStrategy {

    @Override
    public AutoTradeExecutionMode mode() {
        return AutoTradeExecutionMode.PAPER;
    }

    @Override
    public AutoTradeOrderSubmission execute(AutoTradeOrderRequest request) {
        return new AutoTradeOrderSubmission(
                AutoTradeOrderSubmissionKind.PAPER_ACCEPTED,
                request.action(),
                request.clientOrderId(),
                null,
                "PAPER 모의 주문으로 처리했습니다"
        );
    }
}
