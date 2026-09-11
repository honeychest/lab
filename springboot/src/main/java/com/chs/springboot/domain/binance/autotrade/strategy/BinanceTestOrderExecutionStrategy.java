package com.chs.springboot.domain.binance.autotrade.strategy;

import com.chs.springboot.domain.binance.autotrade.model.AutoTradeExecutionMode;
import com.chs.springboot.domain.binance.autotrade.service.AutoTradeFuturesApiClient;
import org.springframework.stereotype.Component;

@Component
public class BinanceTestOrderExecutionStrategy extends BinanceOrderExecutionStrategy {

    public BinanceTestOrderExecutionStrategy(AutoTradeFuturesApiClient apiClient) {
        super(apiClient);
    }

    @Override
    protected String path() {
        return "/fapi/v1/order/test";
    }

    @Override
    protected AutoTradeExecutionMode executionMode() {
        return AutoTradeExecutionMode.TEST;
    }
}
