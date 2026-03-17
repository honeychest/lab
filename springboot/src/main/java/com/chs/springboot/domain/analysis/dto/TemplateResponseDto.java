// [AGENT] T4-ANALYSIS: 템플릿 응답 DTO
package com.chs.springboot.domain.analysis.dto;

import lombok.AllArgsConstructor;
import lombok.Getter;

import java.time.LocalDateTime;

@Getter
@AllArgsConstructor
public class TemplateResponseDto {
    private Long          id;
    private String        name;
    private String        conditions;
    private String        palette;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
