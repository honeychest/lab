// [AGENT] 역할: Binance 청산 강제주문 저장 엔티티 (force_order 테이블) | 연관파일: ForceOrderRepository.java, ForceOrderStreamService.java
// 주요필드: symbol·side·orderType·timeInForce·originalQuantity·price·avgPrice·orderStatus·lastFilledQty·filledAccumulatedQty·tradeTimeMs·eventTimeMs
// UK: (symbol, trade_time_ms, side, original_quantity)
package com.chs.springboot.domain.binance.model;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;
import org.hibernate.annotations.Comment;

import java.math.BigDecimal;

@Entity
@Getter
@Setter
@Table(
    name = "force_order",
    uniqueConstraints = @UniqueConstraint(
        name = "uq_force_order",
        columnNames = {"symbol", "trade_time_ms", "side", "original_quantity"}
    ),
    indexes = {
        @Index(name = "idx_fo_symbol_time", columnList = "symbol, trade_time_ms")
    }
)
public class ForceOrder {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Comment("PK")
    private Long id;

    @Comment("심볼 — o.s")
    @Column(name = "symbol", nullable = false, length = 20)
    private String symbol;

    @Comment("청산 방향 BUY/SELL — o.S")
    @Column(name = "side", nullable = false, length = 10)
    private String side;

    @Comment("주문 유형 LIMIT — o.o")
    @Column(name = "order_type", nullable = false, length = 10)
    private String orderType;

    @Comment("유효 기간 IOC — o.f")
    @Column(name = "time_in_force", nullable = false, length = 10)
    private String timeInForce;

    @Comment("원래 주문 수량 — o.q")
    @Column(name = "original_quantity", nullable = false, precision = 20, scale = 8)
    private BigDecimal originalQuantity;

    @Comment("주문 가격 — o.p")
    @Column(name = "price", nullable = false, precision = 20, scale = 8)
    private BigDecimal price;

    @Comment("평균 체결가 — o.ap")
    @Column(name = "avg_price", nullable = false, precision = 20, scale = 8)
    private BigDecimal avgPrice;

    @Comment("주문 상태 FILLED — o.X")
    @Column(name = "order_status", nullable = false, length = 20)
    private String orderStatus;

    @Comment("마지막 체결 수량 — o.l")
    @Column(name = "last_filled_qty", nullable = false, precision = 20, scale = 8)
    private BigDecimal lastFilledQty;

    @Comment("누적 체결 수량 — o.z")
    @Column(name = "filled_accumulated_qty", nullable = false, precision = 20, scale = 8)
    private BigDecimal filledAccumulatedQty;

    @Comment("체결 시각 Unix ms — o.T")
    @Column(name = "trade_time_ms", nullable = false)
    private Long tradeTimeMs;

    @Comment("이벤트 발생 시각 Unix ms — E")
    @Column(name = "event_time_ms", nullable = false)
    private Long eventTimeMs;
}
