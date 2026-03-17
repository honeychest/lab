// [AGENT] T4-ANALYSIS: conditionTree unit DTO — T3-ARCH §3 스펙
package com.chs.springboot.domain.analysis.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
@JsonIgnoreProperties(ignoreUnknown = true)
public class ConditionUnitDto {
    private String  type;          // VOLUME_SPIKE | PRICE_CHANGE | DELTA | TIME_RANGE
    private String  op;            // GT | GTE | LT | LTE | POSITIVE | NEGATIVE
    private Double  value;
    private String  sign;          // POSITIVE | NEGATIVE (DELTA 전용)
    private Integer startHour;
    private Integer startMinute;
    private Integer endHour;
    private Integer endMinute;
    private Boolean not;           // true면 결과 반전
}
