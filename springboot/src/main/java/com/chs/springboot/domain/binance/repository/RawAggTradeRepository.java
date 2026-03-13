// [AGENT] 역할: RawAggTrade JPA Repository | 연관파일: RawAggTrade.java, AggTradeStorageService.java
// 주요메서드: insertIgnoreDuplicate (네이티브 INSERT ON DUPLICATE KEY UPDATE), batchInsertIgnoreDuplicate (반복 호출)
package com.chs.springboot.domain.binance.repository;

import com.chs.springboot.domain.binance.model.RawAggTrade;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

public interface RawAggTradeRepository extends JpaRepository<RawAggTrade, Long> {

    @Transactional
    @Modifying
    @Query(value = """
            INSERT INTO raw_agg_trade
                (symbol, market_type, agg_trade_id, price, quantity, first_trade_id, last_trade_id, is_buyer_maker, traded_at, saved_at)
            VALUES
                (:#{#t.symbol}, :#{#t.marketType}, :#{#t.aggTradeId}, :#{#t.price}, :#{#t.quantity},
                 :#{#t.firstTradeId}, :#{#t.lastTradeId}, :#{#t.isBuyerMaker}, :#{#t.tradedAt}, NOW(6))
            ON DUPLICATE KEY UPDATE id = id
            """, nativeQuery = true)
    void insertIgnoreDuplicate(@Param("t") RawAggTrade trade);

    @Transactional
    default void batchInsertIgnoreDuplicate(List<RawAggTrade> trades) {
        for (RawAggTrade trade : trades) {
            insertIgnoreDuplicate(trade);
        }
    }
}

