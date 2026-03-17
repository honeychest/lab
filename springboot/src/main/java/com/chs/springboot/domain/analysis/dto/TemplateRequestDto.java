// [AGENT] T4-ANALYSIS: 템플릿 저장/수정 요청 DTO
package com.chs.springboot.domain.analysis.dto;

import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class TemplateRequestDto {
    private String name;
    private String conditions;
    private String palette;
}
