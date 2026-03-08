// [AGENT] 역할: SPOT/FUTURES BTC 체결 틱 원본 저장 엔티티 (raw_tick 테이블) | 연관파일: RawTickRepository.java, RawTickStorageService.java | 주요필드: marketType·tradeId·price·quantity·isBuyerMaker·tradedAt(바이낸스 ms)·savedAt(@PrePersist)
package com.chs.springboot.domain.binance.model;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;
import org.hibernate.annotations.Comment;

import java.math.BigDecimal;
import java.time.LocalDateTime;

@Entity
@Getter
@Setter
@Table(name = "raw_tick", uniqueConstraints = @UniqueConstraint(name = "uq_rawtick", columnNames = {"trade_id", "market_type"}))
public class RawTick {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Comment("PK")
    private Long id;

    @Comment("SPOT / FUTURES")
    @Column(name = "market_type", nullable = false, length = 10)
    private String marketType;

    @Comment("바이낸스 체결 ID")
    @Column(name = "trade_id", nullable = false)
    private Long tradeId;

    @Comment("체결가")
    @Column(name = "price", nullable = false, precision = 20, scale = 8)
    private BigDecimal price;

    @Comment("체결량")
    @Column(name = "quantity", nullable = false, precision = 20, scale = 8)
    private BigDecimal quantity;

    @Comment("매수자=메이커 여부")
    @Column(name = "is_buyer_maker", nullable = false)
    private Boolean isBuyerMaker;

    @Comment("체결 Unix ms")
    @Column(name = "traded_at", nullable = false)
    private Long tradedAt;

    @Comment("DB 저장 시각")
    @Column(name = "saved_at", updatable = false)
    private LocalDateTime savedAt;

    @PrePersist
    public void prePersist() {
        this.savedAt = LocalDateTime.now();
    }
}
