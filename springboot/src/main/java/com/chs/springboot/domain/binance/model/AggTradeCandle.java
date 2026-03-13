// [AGENT] 역할: 1m/5m 봉 집계 공통 필드 베이스 클래스 | 연관파일: AggTrade1m.java, AggTrade5m.java
// 주요필드: symbol·marketType·candleTimeMs·OHLC·vwap·buy/sellVolume·buy/sellQuantity·buy/sellTradeCount·tradeCount·agg/firstLastTradeId 범위
package com.chs.springboot.domain.binance.model;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;
import org.hibernate.annotations.Comment;

import java.math.BigDecimal;

@MappedSuperclass
@Getter
@Setter
public abstract class AggTradeCandle {

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

    @Comment("봉 시작 Unix ms (UTC)")
    @Column(name = "candle_time_ms", nullable = false)
    private Long candleTimeMs;

    @Comment("시가")
    @Column(name = "open_price", nullable = false, precision = 20, scale = 8)
    private BigDecimal openPrice;

    @Comment("고가")
    @Column(name = "high_price", nullable = false, precision = 20, scale = 8)
    private BigDecimal highPrice;

    @Comment("저가")
    @Column(name = "low_price", nullable = false, precision = 20, scale = 8)
    private BigDecimal lowPrice;

    @Comment("종가")
    @Column(name = "close_price", nullable = false, precision = 20, scale = 8)
    private BigDecimal closePrice;

    @Comment("VWAP (거래량 가중 평균가)")
    @Column(name = "vwap", nullable = false, precision = 20, scale = 8)
    private BigDecimal vwap;

    @Comment("매수 거래대금 USD (is_buyer_maker=0)")
    @Column(name = "buy_volume", nullable = false, precision = 30, scale = 8)
    private BigDecimal buyVolume;

    @Comment("매도 거래대금 USD (is_buyer_maker=1)")
    @Column(name = "sell_volume", nullable = false, precision = 30, scale = 8)
    private BigDecimal sellVolume;

    @Comment("전체 거래대금 USD")
    @Column(name = "total_volume", nullable = false, precision = 30, scale = 8)
    private BigDecimal totalVolume;

    @Comment("매수 수량 코인 (is_buyer_maker=0)")
    @Column(name = "buy_quantity", nullable = false, precision = 30, scale = 8)
    private BigDecimal buyQuantity;

    @Comment("매도 수량 코인 (is_buyer_maker=1)")
    @Column(name = "sell_quantity", nullable = false, precision = 30, scale = 8)
    private BigDecimal sellQuantity;

    @Comment("매수 체결 건수")
    @Column(name = "buy_trade_count", nullable = false)
    private Long buyTradeCount;

    @Comment("매도 체결 건수")
    @Column(name = "sell_trade_count", nullable = false)
    private Long sellTradeCount;

    @Comment("전체 체결 건수")
    @Column(name = "trade_count", nullable = false)
    private Long tradeCount;

    @Comment("MIN(agg_trade_id) — 구간 내 첫 aggTrade")
    @Column(name = "min_agg_trade_id", nullable = false)
    private Long minAggTradeId;

    @Comment("MAX(agg_trade_id) — 구간 내 마지막 aggTrade")
    @Column(name = "max_agg_trade_id", nullable = false)
    private Long maxAggTradeId;

    @Comment("MIN(first_trade_id) — 구간 내 첫 원시 체결")
    @Column(name = "min_first_trade_id", nullable = false)
    private Long minFirstTradeId;

    @Comment("MAX(last_trade_id) — 구간 내 마지막 원시 체결")
    @Column(name = "max_last_trade_id", nullable = false)
    private Long maxLastTradeId;
}
