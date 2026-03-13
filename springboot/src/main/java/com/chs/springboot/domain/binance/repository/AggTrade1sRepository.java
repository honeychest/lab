// [AGENT] 역할: AggTrade1s JPA Repository | 연관파일: AggTrade1s.java, AggTrade1sRollupService.java
// 주요메서드: findMaxCandleTimeMsBySymbolAndMarketType, findAllCandleTimeMsBySymbolAndMarketTypeAndRange,
//             findLatestClosePriceBefore, insertIgnoreDuplicate
package com.chs.springboot.domain.binance.repository;

import com.chs.springboot.domain.binance.model.AggTrade1s;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;

public interface AggTrade1sRepository extends JpaRepository<AggTrade1s, Long> {

    @Query("SELECT MAX(a.candleTimeMs) FROM AggTrade1s a WHERE a.symbol = :symbol AND a.marketType = :marketType")
    Optional<Long> findMaxCandleTimeMsBySymbolAndMarketType(
        @Param("symbol") String symbol,
        @Param("marketType") String marketType);

    @Query(value = """
        SELECT candle_time_ms
        FROM agg_trade_1s
        WHERE symbol = :symbol
          AND market_type = :marketType
          AND candle_time_ms >= :startMs
          AND candle_time_ms < :endMs
        """, nativeQuery = true)
    List<Long> findAllCandleTimeMsBySymbolAndMarketTypeAndRange(
        @Param("symbol") String symbol,
        @Param("marketType") String marketType,
        @Param("startMs") long startMs,
        @Param("endMs") long endMs);

    @Query(value = """
        SELECT close_price
        FROM agg_trade_1s
        WHERE symbol = :symbol
          AND market_type = :marketType
          AND candle_time_ms < :beforeMs
        ORDER BY candle_time_ms DESC
        LIMIT 1
        """, nativeQuery = true)
    Optional<BigDecimal> findLatestClosePriceBefore(
        @Param("symbol") String symbol,
        @Param("marketType") String marketType,
        @Param("beforeMs") long beforeMs);

    @Transactional
    @Modifying
    @Query(value = """
        INSERT INTO agg_trade_1s
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
    void insertIgnoreDuplicate(@Param("c") AggTrade1s candle);
}
