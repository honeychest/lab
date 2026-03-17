// [AGENT] T4-ANALYSIS: conditionTree 루트 DTO — T3-ARCH §3 스펙
package com.chs.springboot.domain.analysis.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import lombok.Getter;
import lombok.Setter;

import java.util.List;

@Getter
@Setter
@JsonIgnoreProperties(ignoreUnknown = true)
public class ConditionTreeDto {
    private List<ConditionGroupDto> groups;
    private String                  groupOperator; // AND | OR
    private String                  palette;
}
