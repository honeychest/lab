// [AGENT] 역할: Signal Page 파라미터 영구 저장 엔티티 (signal_params 테이블) | 연관파일: SignalParamsRepository.java, SignalDataService.java
// PK: symbol | 기본값: vol_window=200, trigger_multiplier=10.0, strip_count=7
package com.chs.springboot.domain.binance.model;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;
import org.hibernate.annotations.Comment;

import java.time.LocalDateTime;

@Entity
@Getter
@Setter
@Table(name = "signal_params")
public class SignalParams {

    @Id
    @Comment("심볼 PK (예: BTCUSDT)")
    @Column(name = "symbol", nullable = false, length = 20)
    private String symbol;

    @Comment("평균 변동성 계산 윈도우 (봉 수, 기본 200)")
    @Column(name = "vol_window", nullable = false)
    private Integer volWindow;

    @Comment("트리거 배수 (기본 10.0)")
    @Column(name = "trigger_multiplier", nullable = false)
    private Double triggerMultiplier;

    @Comment("PatternStrip 표시 개수 (기본 7)")
    @Column(name = "strip_count", nullable = false)
    private Integer stripCount;

    @Comment("마지막 수정 시각")
    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;
}
