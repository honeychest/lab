// [AGENT] 역할: AggTrade1m JPA Repository | 연관파일: AggTrade1m.java, AggTradeRollupService.java, SignalDataService.java | 주요메서드: sumEnergyBySymbolAndTimeRange, insertIgnoreDuplicate
package com.chs.springboot.domain.binance.repository;

import com.chs.springboot.domain.binance.model.AggTrade1m;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;

import java.util.Map;
import java.util.Optional;

public interface AggTrade1mRepository extends JpaRepository<AggTrade1m, Long> {

    @Query("SELECT MAX(a.candleTimeMs) FROM AggTrade1m a WHERE a.symbol = :symbol AND a.marketType = :marketType")
    Optional<Long> findMaxCandleTimeMsBySymbolAndMarketType(
        @Param("symbol") String symbol,
        @Param("marketType") String marketType);

    @Query(value = """
        SELECT
            COALESCE(SUM(buy_volume),  0) AS long_energy,
            COALESCE(SUM(sell_volume), 0) AS short_energy
        FROM agg_trade_1m
        WHERE symbol = :symbol
          AND candle_time_ms >= :fromMs
          AND candle_time_ms < :toMs
        """, nativeQuery = true)
    Map<String, Object> sumEnergyBySymbolAndTimeRange(
        @Param("symbol") String symbol,
        @Param("fromMs")  long fromMs,
        @Param("toMs")    long toMs);

    @Transactional
    @Modifying
    @Query(value = """
        INSERT INTO agg_trade_1m
            (symbol, market_type, candle_time_ms,
             open_price, high_price, low_price, close_price, vwap,
             buy_volume, sell_volume, total_volume,
             buy_quantity, sell_quantity, delta,
             buy_trade_count, sell_trade_count, trade_count,
             min_agg_trade_id, max_agg_trade_id,
             min_first_trade_id, max_last_trade_id)
        VALUES
            (:#{#c.symbol}, :#{#c.marketType}, :#{#c.candleTimeMs},
             :#{#c.openPrice}, :#{#c.highPrice}, :#{#c.lowPrice}, :#{#c.closePrice}, :#{#c.vwap},
             :#{#c.buyVolume}, :#{#c.sellVolume}, :#{#c.totalVolume},
             :#{#c.buyQuantity}, :#{#c.sellQuantity}, :#{#c.delta},
             :#{#c.buyTradeCount}, :#{#c.sellTradeCount}, :#{#c.tradeCount},
             :#{#c.minAggTradeId}, :#{#c.maxAggTradeId},
             :#{#c.minFirstTradeId}, :#{#c.maxLastTradeId})
        ON DUPLICATE KEY UPDATE id = id
        """, nativeQuery = true)
    void insertIgnoreDuplicate(@Param("c") AggTrade1m candle);
}
