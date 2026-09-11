package com.chs.springboot.domain.binance.autotrade.strategy;

import com.chs.springboot.domain.binance.autotrade.model.AutoTradeExecutionMode;
import com.chs.springboot.domain.binance.autotrade.model.AutoTradeOrderRequest;
import com.chs.springboot.domain.binance.autotrade.model.AutoTradeOrderSubmission;

public interface AutoTradeOrderExecutionStrategy {

    AutoTradeExecutionMode mode();

    AutoTradeOrderSubmission execute(AutoTradeOrderRequest request);
}
