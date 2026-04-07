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

    // traded_at 기준 최솟값 조회 (아카이빙 대상 날짜 탐색용)
    @Query(value = "SELECT MIN(traded_at) FROM raw_agg_trade WHERE traded_at < :cutoffMs", nativeQuery = true)
    Long findMinTradedAtBefore(@Param("cutoffMs") long cutoffMs);

    // 최근 N분간 INSERT 건수 조회 (거래량 기반 아카이빙 실행 여부 판단)
    @Query(value = "SELECT COUNT(*) FROM raw_agg_trade WHERE traded_at > :thresholdMs", nativeQuery = true)
    long countByTradedAtAfter(@Param("thresholdMs") long thresholdMs);

    // 범위 내 건수 조회 (아카이빙 실행 전 대상 건수 확인용)
    @Query(value = "SELECT COUNT(*) FROM raw_agg_trade WHERE traded_at >= :startMs AND traded_at < :endMs", nativeQuery = true)
    long countByTradedAtRange(@Param("startMs") long startMs, @Param("endMs") long endMs);

    // 날짜 범위 + 커서 기반 페이징 조회 (대용량 CSV 변환용, OFFSET 방식보다 빠름)
    @Query(value = """
            SELECT * FROM raw_agg_trade
            WHERE traded_at >= :startMs AND traded_at < :endMs AND id > :lastId
            ORDER BY id
            LIMIT :pageSize
            """, nativeQuery = true)
    List<RawAggTrade> findByTradedAtRangeAfterIdPaged(
            @Param("startMs") long startMs,
            @Param("endMs") long endMs,
            @Param("lastId") long lastId,
            @Param("pageSize") int pageSize
    );

    // 날짜 범위 배치 DELETE (S3 업로드 완료 후 호출, 락 경합 최소화를 위해 LIMIT으로 분할)
    @Transactional
    @Modifying
    @Query(value = "DELETE FROM raw_agg_trade WHERE traded_at >= :startMs AND traded_at < :endMs LIMIT :batchSize", nativeQuery = true)
    int deleteByTradedAtRangeBatch(
            @Param("startMs") long startMs,
            @Param("endMs") long endMs,
            @Param("batchSize") int batchSize
    );

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

