// [AGENT] Signal Dashboard 핵심 비즈니스 로직 — init/history/patterns API 데이터 조립
// 연관파일: SignalController.java, RawAggTradeRepository.java, OpenInterestRepository.java, ForceOrderRepository.java, AggTrade1mRepository.java, AggTrade5mRepository.java
// 주요메서드: getInitData, getHistoryData, findPatterns, calcLargeTradeThreshold, calcMovingAverage
package com.chs.springboot.domain.binance.service;

import com.chs.springboot.domain.binance.repository.AggTrade1mRepository;
import com.chs.springboot.domain.binance.repository.AggTrade5mRepository;
import com.chs.springboot.domain.binance.repository.ForceOrderRepository;
import com.chs.springboot.domain.binance.repository.OpenInterestRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Slf4j
@Service
@RequiredArgsConstructor
public class SignalDataService {

    private final JdbcTemplate jdbcTemplate;
    private final OpenInterestRepository openInterestRepository;
    private final ForceOrderRepository forceOrderRepository;
    private final AggTrade1mRepository agg1mRepository;
    private final AggTrade5mRepository agg5mRepository;

    public Map<String, Object> getInitData(String symbol) {
        Map<String, Object> result = new HashMap<>();

        BigDecimal threshold = calcLargeTradeThreshold(symbol);
        result.put("largeTradeThreshold", threshold.doubleValue());

        var latestOi = openInterestRepository.findTopBySymbolOrderByCollectedAtMsDesc(symbol);
        if (latestOi.isPresent()) {
            Map<String, Object> oiData = new HashMap<>();
            oiData.put("symbol",        latestOi.get().getSymbol());
            oiData.put("openInterest",  latestOi.get().getOpenInterest().toPlainString());
            oiData.put("collectedAtMs", latestOi.get().getCollectedAtMs());
            result.put("latestOI", oiData);
        } else {
            result.put("latestOI", null);
        }

        result.put("latestFundingRate", 0.0001);

        return result;
    }

    public Map<String, Object> getHistoryData(String symbol, String range) {
        long nowMs  = System.currentTimeMillis();
        long fromMs = switch (range) {
            case "5m"  -> nowMs -  5 * 60_000L;
            case "10m" -> nowMs - 10 * 60_000L;
            case "30m" -> nowMs - 30 * 60_000L;
            case "50m" -> nowMs - 50 * 60_000L;
            case "1h"  -> nowMs -      60 * 60_000L;
            case "4h"  -> nowMs -  4 * 60 * 60_000L;
            case "5h"  -> nowMs -  5 * 60 * 60_000L;
            case "10h" -> nowMs - 10 * 60 * 60_000L;
            case "40h" -> nowMs - 40 * 60 * 60_000L;
            case "1d"  -> nowMs - 24 * 60 * 60_000L;
            default    -> nowMs;
        };

        // 10m·50m 이하 → 1분봉 롤업 / 그 이상 → 5분봉 롤업
        Map<String, Object> energyRow = switch (range) {
            case "5m", "10m", "30m", "50m" -> agg1mRepository.sumEnergyBySymbolAndTimeRange(symbol, fromMs, nowMs);
            default                         -> agg5mRepository.sumEnergyBySymbolAndTimeRange(symbol, fromMs, nowMs);
        };

        BigDecimal longEnergy  = toBd(energyRow.get("long_energy"));
        BigDecimal shortEnergy = toBd(energyRow.get("short_energy"));

        // 누계: SUM 집계 쿼리 (전체 범위, 목록 조회 없음)
        BigDecimal longLiqTotal  = BigDecimal.ZERO;
        BigDecimal shortLiqTotal = BigDecimal.ZERO;
        var liqSums = forceOrderRepository.sumLiqTotalBySymbolAndTimeRange(symbol, fromMs, nowMs);
        for (Object[] row : liqSums) {
            String side      = (String) row[0];
            BigDecimal total = toBd(row[1]);
            if ("SELL".equals(side)) {
                longLiqTotal = total;
                longEnergy   = longEnergy.subtract(total);
            } else {
                shortLiqTotal = total;
                shortEnergy   = shortEnergy.subtract(total);
            }
        }

        // 이벤트 목록: 최근 10건만
        List<Map<String, Object>> longLiqEvents  = new java.util.ArrayList<>();
        List<Map<String, Object>> shortLiqEvents = new java.util.ArrayList<>();
        var top10 = forceOrderRepository.findTop10BySymbolAndTradeTimeMsBetweenOrderByTradeTimeMsDesc(symbol, fromMs, nowMs);
        for (var fo : top10) {
            Map<String, Object> event = new HashMap<>();
            event.put("side",        fo.getSide());
            event.put("price",       fo.getPrice().toPlainString());
            event.put("avgPrice",    fo.getAvgPrice().toPlainString());
            event.put("quantity",    fo.getOriginalQuantity().toPlainString());
            event.put("tradeTimeMs", fo.getTradeTimeMs());
            if ("SELL".equals(fo.getSide())) {
                longLiqEvents.add(event);
            } else {
                shortLiqEvents.add(event);
            }
        }

        var oiList = openInterestRepository
                .findBySymbolAndCollectedAtMsBetweenOrderByCollectedAtMsAsc(symbol, fromMs, nowMs);
        List<Map<String, Object>> oiHistory = oiList.stream()
                .map(oi -> {
                    Map<String, Object> m = new HashMap<>();
                    m.put("symbol",        oi.getSymbol());
                    m.put("openInterest",  oi.getOpenInterest().toPlainString());
                    m.put("price",         oi.getPrice() != null ? oi.getPrice().toPlainString() : null);
                    m.put("collectedAtMs", oi.getCollectedAtMs());
                    return m;
                })
                .toList();

        Map<String, Object> result = new HashMap<>();
        result.put("longEnergy",    longEnergy.max(BigDecimal.ZERO).doubleValue());
        result.put("shortEnergy",   shortEnergy.max(BigDecimal.ZERO).doubleValue());
        result.put("longLiqTotal",  longLiqTotal.doubleValue());
        result.put("shortLiqTotal", shortLiqTotal.doubleValue());
        result.put("longLiqEvents",  longLiqEvents);
        result.put("shortLiqEvents", shortLiqEvents);
        result.put("oiHistory",      oiHistory);

        return result;
    }

    public List<Map<String, Object>> findPatterns(String symbol, BigDecimal volume) {
        BigDecimal minVol = volume.multiply(new BigDecimal("0.5"));
        BigDecimal maxVol = volume.multiply(new BigDecimal("1.5"));

        var candles = agg5mRepository.findBySymbolAndVolumeBetween(symbol, minVol, maxVol);

        return candles.stream()
                .limit(5)
                .map(c -> {
                    Map<String, Object> pattern = new HashMap<>();
                    pattern.put("candleTime",  String.valueOf(c.getCandleTimeMs()));
                    pattern.put("priceChange", 0.0);
                    return pattern;
                })
                .toList();
    }

    public BigDecimal calcLargeTradeThreshold(String symbol) {
        long oneHourAgoMs = System.currentTimeMillis() - 3_600_000L;
        long nowMs        = System.currentTimeMillis();

        String sql = """
            SELECT
                SUM(quantity * price) as total_value,
                COUNT(*) as trade_count
            FROM raw_agg_trade
            WHERE symbol = ? AND traded_at >= ? AND traded_at < ?
            """;

        List<Map<String, Object>> result = jdbcTemplate.queryForList(sql, symbol, oneHourAgoMs, nowMs);
        if (result.isEmpty()) return new BigDecimal("10000");

        Map<String, Object> row = result.get(0);
        BigDecimal totalValue = toBd(row.getOrDefault("total_value", BigDecimal.ZERO));
        long tradeCount       = ((Number) row.getOrDefault("trade_count", 1L)).longValue();

        if (tradeCount == 0) return new BigDecimal("10000");

        return totalValue
                .divide(new BigDecimal(tradeCount), 8, RoundingMode.HALF_UP)
                .multiply(new BigDecimal("10"));
    }

    public BigDecimal calcMovingAverage(String symbol, String marketType, int count) {
        long afterMs = System.currentTimeMillis() - (count * 5L * 60_000L);
        var candles  = agg5mRepository
                .findBySymbolAndMarketTypeAndCandleTimeMsAfterOrderByCandleTimeMsDesc(symbol, marketType, afterMs);

        if (candles.isEmpty()) return BigDecimal.ZERO;

        BigDecimal sum = candles.stream()
                .map(c -> c.getBuyVolume().add(c.getSellVolume()))
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        return sum.divide(new BigDecimal(candles.size()), 8, RoundingMode.HALF_UP);
    }

    private BigDecimal toBd(Object v) {
        if (v == null) return BigDecimal.ZERO;
        if (v instanceof BigDecimal bd) return bd;
        return new BigDecimal(v.toString());
    }
}
