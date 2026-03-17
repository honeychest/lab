// [AGENT] T4-ANALYSIS: 애널리시스 템플릿 REST 컨트롤러
// 엔드포인트: GET/POST /api/analysis/templates, PUT/DELETE /api/analysis/templates/{id}
//             GET /api/analysis/delta
// 연관파일: AnalysisTemplateService.java
package com.chs.springboot.domain.analysis.controller;

import com.chs.springboot.domain.analysis.dto.TemplateRequestDto;
import com.chs.springboot.domain.analysis.dto.TemplateResponseDto;
import com.chs.springboot.domain.analysis.service.AnalysisTemplateService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@Slf4j
@RestController
@RequestMapping("/api/analysis")
@RequiredArgsConstructor
public class AnalysisTemplateController {

    private final AnalysisTemplateService templateService;

    @GetMapping("/templates")
    public ResponseEntity<List<TemplateResponseDto>> getAll() {
        return ResponseEntity.ok(templateService.findAll());
    }

    @PostMapping("/templates")
    public ResponseEntity<TemplateResponseDto> create(@RequestBody TemplateRequestDto req) {
        return ResponseEntity.status(HttpStatus.CREATED).body(templateService.save(req));
    }

    @PutMapping("/templates/{id}")
    public ResponseEntity<TemplateResponseDto> rename(
            @PathVariable Long id,
            @RequestBody TemplateRequestDto req) {
        return ResponseEntity.ok(templateService.rename(id, req));
    }

    @DeleteMapping("/templates/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        templateService.delete(id);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/delta")
    public ResponseEntity<List<Map<String, Object>>> getDelta(
            @RequestParam String symbol,
            @RequestParam long startMs,
            @RequestParam long endMs) {
        log.debug("[AnalysisTemplateController] /delta symbol={} startMs={} endMs={}", symbol, startMs, endMs);
        return ResponseEntity.ok(templateService.getDelta(symbol, startMs, endMs));
    }

    @GetMapping("/templates/{id}/signals")
    public ResponseEntity<Map<String, Object>> getTemplateSignals(
            @PathVariable("id") long templateId,
            @RequestParam String symbol,
            @RequestParam(name = "days", defaultValue = "10") int days) {
        log.debug("[AnalysisTemplateController] /templates/{}/signals symbol={} days={}", templateId, symbol, days);
        return ResponseEntity.ok(templateService.getSignalDays(symbol, templateId, days));
    }
}
