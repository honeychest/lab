// [AGENT] 역할: BTC 대형 체결 DB 엔티티 (big_tick 테이블) | 연관파일: BinanceTradeRepository.java, BinanceTradeService.java | 주요필드: tradeId·marketType(unique), price·quantity·tradeValue, createdAt(@PrePersist)
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
@Table(name = "binance_trade",
        uniqueConstraints = {
                @UniqueConstraint(name = "uq_trade_id_market_type", columnNames = {"trade_id", "market_type"})
        },
        indexes = {
                @Index(name = "idx_traded_at", columnList = "traded_at")
        }
)
public class BinanceTrade {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Comment("PK")
    private Long id;

    @Comment("바이낸스 체결 ID")
    @Column(name = "trade_id", nullable = false)
    private Long tradeId;

    @Comment("거래쌍 (예: BTCUSDT)")
    @Column(name = "symbol", nullable = false, length = 20)
    private String symbol;

    @Comment("시장 구분 (SPOT / FUTURES)")
    @Column(name = "market_type", nullable = false, length = 10)
    private String marketType;

    @Comment("체결 단가 (USD)")
    @Column(name = "price", nullable = false, precision = 20, scale = 8)
    private BigDecimal price;

    @Comment("체결 수량 (BTC)")
    @Column(name = "quantity", nullable = false, precision = 20, scale = 8)
    private BigDecimal quantity;

    @Comment("체결 금액 = price × quantity (USD)")
    @Column(name = "trade_value", nullable = false, precision = 30, scale = 8)
    private BigDecimal tradeValue;

    @Comment("매수자가 메이커 여부 (true = 매도 체결 숏긁음, false = 매수 체결 롱긁음)")
    @Column(name = "is_buyer_maker", nullable = false)
    private Boolean isBuyerMaker;

    @Comment("체결 시각 (UTC milliseconds)")
    @Column(name = "traded_at", nullable = false)
    private Long tradedAt;

    @Comment("레코드 생성 시각 (KST)")
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;

    @PrePersist
    public void prePersist() {
        this.createdAt = LocalDateTime.now();
    }
}
