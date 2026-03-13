// [AGENT] 역할: OpenInterest JPA Repository | 연관파일: OpenInterest.java, OpenInterestPollingService.java, OiBackfillService.java, SignalDataService.java
// 주요메서드: findTopBySymbolOrderByCollectedAtMsDesc, findBySymbolAndCollectedAtMsBetween, findMaxCollectedAtMsBySymbol, insertIgnoreDuplicate
package com.chs.springboot.domain.binance.repository;

import com.chs.springboot.domain.binance.model.OpenInterest;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Optional;

public interface OpenInterestRepository extends JpaRepository<OpenInterest, Long> {

    Optional<OpenInterest> findTopBySymbolOrderByCollectedAtMsDesc(String symbol);

    List<OpenInterest> findBySymbolAndCollectedAtMsBetweenOrderByCollectedAtMsAsc(
            String symbol, long fromMs, long toMs);

    @Query("SELECT MAX(o.collectedAtMs) FROM OpenInterest o WHERE o.symbol = :symbol")
    Optional<Long> findMaxCollectedAtMsBySymbol(@Param("symbol") String symbol);

    @Query("SELECT MIN(o.collectedAtMs) FROM OpenInterest o WHERE o.symbol = :symbol")
    Optional<Long> findMinCollectedAtMsBySymbol(@Param("symbol") String symbol);

    @Transactional
    @Modifying
    @Query(value = """
        INSERT INTO open_interest (symbol, open_interest, oi_value, price, collected_at_ms)
        VALUES (:#{#o.symbol}, :#{#o.openInterest}, :#{#o.oiValue}, :#{#o.price}, :#{#o.collectedAtMs})
        ON DUPLICATE KEY UPDATE id = id
        """, nativeQuery = true)
    void insertIgnoreDuplicate(@Param("o") OpenInterest oi);
}
