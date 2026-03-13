// [AGENT] 역할: ForceOrder JPA Repository | 연관파일: ForceOrder.java, ForceOrderStreamService.java, SignalDataService.java
// 주요메서드: findBySymbolAndTradeTimeMsBetween, insertIgnoreDuplicate
package com.chs.springboot.domain.binance.repository;

import com.chs.springboot.domain.binance.model.ForceOrder;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

public interface ForceOrderRepository extends JpaRepository<ForceOrder, Long> {

    List<ForceOrder> findBySymbolAndTradeTimeMsBetweenOrderByTradeTimeMsDesc(
            String symbol, long fromMs, long toMs);

    @Transactional
    @Modifying
    @Query(value = """
        INSERT INTO force_order
            (symbol, side, order_type, time_in_force,
             original_quantity, price, avg_price, order_status,
             last_filled_qty, filled_accumulated_qty,
             trade_time_ms, event_time_ms)
        VALUES
            (:#{#f.symbol}, :#{#f.side}, :#{#f.orderType}, :#{#f.timeInForce},
             :#{#f.originalQuantity}, :#{#f.price}, :#{#f.avgPrice}, :#{#f.orderStatus},
             :#{#f.lastFilledQty}, :#{#f.filledAccumulatedQty},
             :#{#f.tradeTimeMs}, :#{#f.eventTimeMs})
        ON DUPLICATE KEY UPDATE id = id
        """, nativeQuery = true)
    void insertIgnoreDuplicate(@Param("f") ForceOrder forceOrder);
}
