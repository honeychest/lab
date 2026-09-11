package com.chs.springboot.domain.binance.autotrade.service;

import com.chs.springboot.domain.binance.autotrade.model.AutoTradePaperPosition;
import org.springframework.stereotype.Component;

import java.util.concurrent.ConcurrentHashMap;

@Component
public class AutoTradePaperPositionStore {

    private final ConcurrentHashMap<String, AutoTradePaperPosition> positions = new ConcurrentHashMap<>();

    public AutoTradePaperPosition get(String symbol) {
        return positions.get(symbol.toUpperCase());
    }

    public void put(String symbol, AutoTradePaperPosition position) {
        positions.put(symbol.toUpperCase(), position);
    }

    public void delete(String symbol) {
        positions.remove(symbol.toUpperCase());
    }
}
