// [AGENT] T4-ANALYSIS: AnalysisTemplate JPA Repository
package com.chs.springboot.domain.analysis.repository;

import com.chs.springboot.domain.analysis.model.AnalysisTemplate;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface AnalysisTemplateRepository extends JpaRepository<AnalysisTemplate, Long> {
    List<AnalysisTemplate> findAllByOrderByCreatedAtDesc();
}
