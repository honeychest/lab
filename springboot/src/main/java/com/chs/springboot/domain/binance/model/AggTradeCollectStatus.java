package com.chs.springboot.domain.binance.model;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;
import org.hibernate.annotations.Comment;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.LocalDateTime;

@Entity
@Getter
@Setter
@Table(
        name = "aggtrade_collect_status",
        uniqueConstraints = @UniqueConstraint(
                name = "uq_aggtrade_collect_status_symbol_market",
                columnNames = {"symbol", "market_type"}
        )
)
public class AggTradeCollectStatus {

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

    @Comment("실시간 스트림으로 DB까지 적재된 마지막 agg_trade_id")
    @Column(name = "last_stream_agg_id")
    private Long lastStreamAggId;

    @Comment("백필(과거→현재)로 DB까지 적재된 마지막 agg_trade_id")
    @Column(name = "last_backfill_agg_id")
    private Long lastBackfillAggId;

    @Comment("백필 수행 주기 (분 단위)")
    @Column(name = "backfill_interval_min")
    private Integer backfillIntervalMin;

    @Comment("다음 백필 예정 시각")
    @Column(name = "next_backfill_at")
    private LocalDateTime nextBackfillAt;

    @Comment("해당 심볼/마켓에 대해 백필을 마지막으로 수행한 시각")
    @Column(name = "last_backfill_checked_at")
    private LocalDateTime lastBackfillCheckedAt;

    @Comment("누락(갭)을 마지막으로 감지한 시각")
    @Column(name = "last_gap_detected_at")
    private LocalDateTime lastGapDetectedAt;

    @Comment("백필 누락 채움 알림을 마지막으로 전송한 시각")
    @Column(name = "last_backfill_notified_at")
    private LocalDateTime lastBackfillNotifiedAt;

    @Comment("수집/백필 활성 여부")
    @Column(name = "enabled", nullable = false)
    private Boolean enabled = Boolean.TRUE;

    @Comment("운영 메모")
    @Column(name = "notes", length = 500)
    private String notes;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at")
    private LocalDateTime updatedAt;
}

