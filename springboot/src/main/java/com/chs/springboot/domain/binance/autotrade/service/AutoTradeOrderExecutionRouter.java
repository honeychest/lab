package com.chs.springboot.domain.binance.autotrade.service;

import com.chs.springboot.domain.binance.autotrade.model.AutoTradeExecutionMode;
import com.chs.springboot.domain.binance.autotrade.model.AutoTradeOrderRequest;
import com.chs.springboot.domain.binance.autotrade.model.AutoTradeOrderSubmission;
import com.chs.springboot.domain.binance.autotrade.model.AutoTradeOrderSubmissionKind;
import com.chs.springboot.domain.binance.autotrade.strategy.AutoTradeOrderExecutionStrategy;
import org.springframework.stereotype.Service;

import java.util.EnumMap;
import java.util.List;
import java.util.Map;

@Service
public class AutoTradeOrderExecutionRouter {

    private final Map<AutoTradeExecutionMode, AutoTradeOrderExecutionStrategy> strategies;

    public AutoTradeOrderExecutionRouter(List<AutoTradeOrderExecutionStrategy> strategies) {
        EnumMap<AutoTradeExecutionMode, AutoTradeOrderExecutionStrategy> index =
                new EnumMap<>(AutoTradeExecutionMode.class);
        strategies.forEach(strategy -> index.put(strategy.mode(), strategy));
        this.strategies = Map.copyOf(index);
    }

    public AutoTradeOrderSubmission execute(AutoTradeExecutionMode mode, AutoTradeOrderRequest request) {
        if (mode == AutoTradeExecutionMode.OFF) {
            return new AutoTradeOrderSubmission(
                    AutoTradeOrderSubmissionKind.SKIPPED,
                    request.action(),
                    request.clientOrderId(),
                    null,
                    "자동매매 실행 모드가 OFF입니다"
            );
        }
        AutoTradeOrderExecutionStrategy strategy = strategies.get(mode);
        if (strategy == null) {
            return new AutoTradeOrderSubmission(
                    AutoTradeOrderSubmissionKind.REJECTED,
                    request.action(),
                    request.clientOrderId(),
                    null,
                    "지원하지 않는 자동매매 실행 모드입니다: " + mode
            );
        }
        return strategy.execute(request);
    }
}
