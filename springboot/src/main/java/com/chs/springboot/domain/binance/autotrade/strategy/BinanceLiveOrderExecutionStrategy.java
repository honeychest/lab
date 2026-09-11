package com.chs.springboot.domain.binance.autotrade.strategy;

import com.chs.springboot.domain.binance.autotrade.model.AutoTradeExecutionMode;
import com.chs.springboot.domain.binance.autotrade.service.AutoTradeFuturesApiClient;
import org.springframework.stereotype.Component;

@Component
public class BinanceLiveOrderExecutionStrategy extends BinanceOrderExecutionStrategy {

    public BinanceLiveOrderExecutionStrategy(AutoTradeFuturesApiClient apiClient) {
        super(apiClient);
    }

    @Override
    protected String path() {
        return "/fapi/v1/order";
    }

    @Override
    protected AutoTradeExecutionMode executionMode() {
        return AutoTradeExecutionMode.LIVE;
    }
}
