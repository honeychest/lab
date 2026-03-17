// [AGENT] T4-ANALYSIS: 애널리시스 조건 템플릿 엔티티 (analysis_template 테이블)
package com.chs.springboot.domain.analysis.model;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

import java.time.LocalDateTime;

@Getter
@Setter
@Entity
@Table(name = "analysis_template")
public class AnalysisTemplate {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(columnDefinition = "BIGINT COMMENT 'PK'")
    private Long id;

    @Column(nullable = false, columnDefinition = "VARCHAR(100) COMMENT '템플릿 이름'")
    private String name;

    @Column(nullable = false, columnDefinition = "TEXT COMMENT '조건 트리 JSON'")
    private String conditions;

    @Column(columnDefinition = "VARCHAR(20) COMMENT '팔레트 레벨 (LOW/MID/HIGH)'")
    private String palette;

    @Column(name = "created_at", updatable = false,
            columnDefinition = "DATETIME COMMENT '생성일시'")
    private LocalDateTime createdAt;

    @Column(name = "updated_at",
            columnDefinition = "DATETIME COMMENT '수정일시'")
    private LocalDateTime updatedAt;

    @PrePersist
    protected void onCreate() {
        createdAt = updatedAt = LocalDateTime.now();
    }

    @PreUpdate
    protected void onUpdate() {
        updatedAt = LocalDateTime.now();
    }
}
