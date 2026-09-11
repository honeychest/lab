package com.chs.springboot.domain.binance.autotrade.service;

import com.fasterxml.jackson.databind.JsonNode;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Map;

@Service
@RequiredArgsConstructor
public class AutoTradeSymbolCatalogService {

    private static final long CACHE_TTL_MS = 5 * 60 * 1000L;

    private final AutoTradeFuturesApiClient apiClient;
    private volatile List<String> cachedSymbols = List.of();
    private volatile long cachedAtMs;

    public List<String> symbols() {
        long now = System.currentTimeMillis();
        if (!cachedSymbols.isEmpty() && now - cachedAtMs < CACHE_TTL_MS) {
            return cachedSymbols;
        }
        synchronized (this) {
            now = System.currentTimeMillis();
            if (!cachedSymbols.isEmpty() && now - cachedAtMs < CACHE_TTL_MS) {
                return cachedSymbols;
            }
            JsonNode exchangeInfo = apiClient.getPublic("/fapi/v1/exchangeInfo", Map.of());
            List<String> symbols = AutoTradeSymbolCatalogParser.parse(exchangeInfo);
            cachedSymbols = symbols;
            cachedAtMs = now;
            return symbols;
        }
    }
}
