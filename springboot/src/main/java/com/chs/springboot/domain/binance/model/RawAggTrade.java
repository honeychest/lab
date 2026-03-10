package com.chs.springboot.domain.binance.model;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;
import org.hibernate.annotations.Comment;
import org.hibernate.annotations.CreationTimestamp;

import java.math.BigDecimal;
import java.time.LocalDateTime;

@Entity
@Getter
@Setter
@Table(
        name = "raw_agg_trade",
        uniqueConstraints = @UniqueConstraint(
                name = "uq_raw_agg_trade",
                columnNames = {"agg_trade_id", "symbol", "market_type"}
        )
)
public class RawAggTrade {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Comment("PK")
    private Long id;

    @Comment("심볼 (예: BTCUSDT)")
    @Column(name = "symbol", nullable = false, length = 20)
    private String symbol;

    @Comment("SPOT / FUTURES")
    @Column(name = "market_type", nullable = false, length = 10)
    private String marketType;

    @Comment("Binance aggTrade a 필드")
    @Column(name = "agg_trade_id", nullable = false)
    private Long aggTradeId;

    @Comment("체결가 (p)")
    @Column(name = "price", nullable = false, precision = 20, scale = 8)
    private BigDecimal price;

    @Comment("체결량 (q)")
    @Column(name = "quantity", nullable = false, precision = 20, scale = 8)
    private BigDecimal quantity;

    @Comment("first trade id (f)")
    @Column(name = "first_trade_id", nullable = false)
    private Long firstTradeId;

    @Comment("last trade id (l)")
    @Column(name = "last_trade_id", nullable = false)
    private Long lastTradeId;

    @Comment("매수자=메이커 여부 (m)")
    @Column(name = "is_buyer_maker", nullable = false)
    private Boolean isBuyerMaker;

    @Comment("체결 Unix ms (T)")
    @Column(name = "traded_at", nullable = false)
    private Long tradedAt;

    @Comment("DB 저장 시각")
    @CreationTimestamp
    @Column(name = "saved_at", updatable = false)
    private LocalDateTime savedAt;
}

