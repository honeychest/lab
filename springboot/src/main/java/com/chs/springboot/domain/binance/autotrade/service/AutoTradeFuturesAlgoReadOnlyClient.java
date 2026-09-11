package com.chs.springboot.domain.binance.autotrade.service;

import com.chs.springboot.domain.binance.autotrade.model.AutoTradeFuturesAlgoOrder;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Map;

@Component
@RequiredArgsConstructor
public class AutoTradeFuturesAlgoReadOnlyClient {

    private final AutoTradeFuturesApiClient apiClient;

    public List<AutoTradeFuturesAlgoOrder> openOrders(String symbol) {
        if (!apiClient.isConfigured()) {
            throw new IllegalStateException("자동매매 전용 선물 API 키가 설정되지 않았습니다");
        }
        return AutoTradeFuturesAlgoResponseParser.openOrders(
                apiClient.getSigned("/fapi/v1/openAlgoOrders", Map.of("symbol", symbol)));
    }
}
