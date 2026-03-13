// [AGENT] 역할: 1분봉 집계 엔티티 (agg_trade_1m 테이블) | 연관파일: AggTrade1mRepository.java, AggTradeRollupService.java
// 공통 필드: AggTradeCandle (상위 클래스) 참조 | 추가 필드: delta (매수수량 - 매도수량)
// UK: (symbol, market_type, candle_time_ms)
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
    name = "agg_trade_1m",
    uniqueConstraints = @UniqueConstraint(
        name = "uq_agg_trade_1m",
        columnNames = {"symbol", "market_type", "candle_time_ms"}
    ),
    indexes = {
        @Index(name = "idx_1m_symbol_candle_time", columnList = "symbol, candle_time_ms"),
        @Index(name = "idx_1m_candle_time",        columnList = "candle_time_ms")
    }
)
public class AggTrade1m extends AggTradeCandle {

    @Comment("매수수량 - 매도수량 (delta)")
    @Column(name = "delta", nullable = false,
            columnDefinition = "DECIMAL(30,8) NOT NULL DEFAULT 0")
    private BigDecimal delta;
}
