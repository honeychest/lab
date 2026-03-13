// [AGENT] 역할: 1초봉 집계 엔티티 (agg_trade_1s 테이블) | 연관파일: AggTradeCandle.java, AggTrade1sRepository.java, AggTrade1sRollupService.java
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
    name = "agg_trade_1s",
    uniqueConstraints = @UniqueConstraint(
        name = "uq_agg_trade_1s",
        columnNames = {"symbol", "market_type", "candle_time_ms"}
    ),
    indexes = {
        @Index(name = "idx_1s_symbol_candle_time", columnList = "symbol, candle_time_ms"),
        @Index(name = "idx_1s_candle_time",        columnList = "candle_time_ms")
    }
)
public class AggTrade1s extends AggTradeCandle {

    @Comment("매수수량 - 매도수량 (delta)")
    @Column(name = "delta", nullable = false, precision = 30, scale = 8)
    private BigDecimal delta;
}
