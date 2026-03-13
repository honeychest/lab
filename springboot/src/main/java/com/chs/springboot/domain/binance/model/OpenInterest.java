// [AGENT] 역할: Binance Open Interest 저장 엔티티 (open_interest 테이블) | 연관파일: OpenInterestRepository.java, OpenInterestPollingService.java
// 주요필드: symbol·openInterest·price·collectedAtMs | UK: (symbol, collected_at_ms)
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
    name = "open_interest",
    uniqueConstraints = @UniqueConstraint(
        name = "uq_open_interest",
        columnNames = {"symbol", "collected_at_ms"}
    ),
    indexes = {
        @Index(name = "idx_oi_symbol_time", columnList = "symbol, collected_at_ms")
    }
)
public class OpenInterest {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Comment("PK")
    private Long id;

    @Comment("심볼 (예: BTCUSDT) — symbol")
    @Column(name = "symbol", nullable = false, length = 20)
    private String symbol;

    @Comment("미결제약정 수량 (코인) — openInterest")
    @Column(name = "open_interest", nullable = false, precision = 30, scale = 8)
    private BigDecimal openInterest;

    @Comment("USD 환산값 (sumOpenInterestValue) — 백필 시 채움, live polling은 null")
    @Column(name = "oi_value", nullable = true, precision = 30, scale = 8)
    private BigDecimal oiValue;

    @Comment("수집 시각의 현재가 (USD) — price")
    @Column(name = "price", nullable = true, precision = 30, scale = 8)
    private BigDecimal price;

    @Comment("수집 시각 Unix ms — time")
    @Column(name = "collected_at_ms", nullable = false)
    private Long collectedAtMs;
}
