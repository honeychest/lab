// [AGENT] T4-ANALYSIS: conditionTree group DTO — T3-ARCH §3 스펙
package com.chs.springboot.domain.analysis.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import lombok.Getter;
import lombok.Setter;

import java.util.List;

@Getter
@Setter
@JsonIgnoreProperties(ignoreUnknown = true)
public class ConditionGroupDto {
    private String               operator;      // AND | OR | NOT
    private List<ConditionUnitDto> units;
    private List<String>         unitOperators;
}
