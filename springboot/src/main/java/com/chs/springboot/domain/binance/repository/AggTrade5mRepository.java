// [AGENT] 역할: AggTrade5m JPA Repository | 연관파일: AggTrade5m.java, AggTradeRollupService.java, SignalDataService.java | 주요메서드: sumEnergyBySymbolAndTimeRange, findBySymbolAndVolumeBetween, findBySymbolAndMarketTypeAndCandleTimeMsAfter, insertIgnoreDuplicate
package com.chs.springboot.domain.binance.repository;

import com.chs.springboot.domain.binance.model.AggTrade5m;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.Optional;

public interface AggTrade5mRepository extends JpaRepository<AggTrade5m, Long> {

    @Query("SELECT MAX(a.candleTimeMs) FROM AggTrade5m a WHERE a.symbol = :symbol AND a.marketType = :marketType")
    Optional<Long> findMaxCandleTimeMsBySymbolAndMarketType(
        @Param("symbol") String symbol,
        @Param("marketType") String marketType);

    @Query(value = """
        SELECT
            COALESCE(SUM(buy_volume),  0) AS long_energy,
            COALESCE(SUM(sell_volume), 0) AS short_energy
        FROM agg_trade_5m
        WHERE symbol = :symbol
          AND candle_time_ms >= :fromMs
          AND candle_time_ms < :toMs
        """, nativeQuery = true)
    Map<String, Object> sumEnergyBySymbolAndTimeRange(
        @Param("symbol") String symbol,
        @Param("fromMs")  long fromMs,
        @Param("toMs")    long toMs);

    // findPatterns 용 — (buy_volume + sell_volume) 범위 조회
    @Query(value = """
        SELECT * FROM agg_trade_5m
        WHERE symbol = :symbol
          AND (buy_volume + sell_volume) BETWEEN :minVol AND :maxVol
        ORDER BY candle_time_ms DESC
        """, nativeQuery = true)
    List<AggTrade5m> findBySymbolAndVolumeBetween(
        @Param("symbol") String symbol,
        @Param("minVol") BigDecimal minVol,
        @Param("maxVol") BigDecimal maxVol);

    // calcMovingAverage 용 — 특정 시각 이후 봉 조회
    List<AggTrade5m> findBySymbolAndMarketTypeAndCandleTimeMsAfterOrderByCandleTimeMsDesc(
        String symbol, String marketType, long candleTimeMsAfter);

    @Transactional
    @Modifying
    @Query(value = """
        INSERT INTO agg_trade_5m
            (symbol, market_type, candle_time_ms,
             open_price, high_price, low_price, close_price, vwap,
             buy_volume, sell_volume, total_volume,
             buy_quantity, sell_quantity,
             buy_trade_count, sell_trade_count, trade_count,
             min_agg_trade_id, max_agg_trade_id,
             min_first_trade_id, max_last_trade_id)
        VALUES
            (:#{#c.symbol}, :#{#c.marketType}, :#{#c.candleTimeMs},
             :#{#c.openPrice}, :#{#c.highPrice}, :#{#c.lowPrice}, :#{#c.closePrice}, :#{#c.vwap},
             :#{#c.buyVolume}, :#{#c.sellVolume}, :#{#c.totalVolume},
             :#{#c.buyQuantity}, :#{#c.sellQuantity},
             :#{#c.buyTradeCount}, :#{#c.sellTradeCount}, :#{#c.tradeCount},
             :#{#c.minAggTradeId}, :#{#c.maxAggTradeId},
             :#{#c.minFirstTradeId}, :#{#c.maxLastTradeId})
        ON DUPLICATE KEY UPDATE id = id
        """, nativeQuery = true)
    void insertIgnoreDuplicate(@Param("c") AggTrade5m candle);
}
