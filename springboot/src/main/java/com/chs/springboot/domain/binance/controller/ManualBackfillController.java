// [AGENT] 역할: 수동 수집 어드민 API | 연관파일: ManualBackfillService.java
// 엔드포인트: GET /api/admin/backfill/range, POST /api/admin/backfill/collect, GET /api/admin/backfill/status/{jobId}, GET /api/admin/backfill/jobs
// 접근 제어: AdminIpInterceptor(/api/admin/**)가 담당
package com.chs.springboot.domain.binance.controller;

import com.chs.springboot.domain.binance.service.ManualBackfillService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.*;

@RestController
@RequestMapping("/api/admin/backfill")
public class ManualBackfillController {

    private final ManualBackfillService service;

    public ManualBackfillController(ManualBackfillService service) {
        this.service = service;
    }

    /** 수집 시작 — 비동기, jobId 즉시 반환 */
    @PostMapping("/collect")
    public ResponseEntity<?> collect(@RequestBody Map<String, Object> body) {
        try {
            String type       = (String) body.get("type");
            String symbol     = (String) body.get("symbol");
            String marketType = (String) body.getOrDefault("marketType", "FUTURES");
            Long fromId = body.get("fromId") != null ? ((Number) body.get("fromId")).longValue() : null;
            Long toId   = body.get("toId")   != null ? ((Number) body.get("toId")).longValue()   : null;
            Long fromMs = body.get("fromMs") != null ? ((Number) body.get("fromMs")).longValue() : null;
            Long toMs   = body.get("toMs")   != null ? ((Number) body.get("toMs")).longValue()   : null;

            if (type == null || symbol == null) {
                return ResponseEntity.badRequest().body(Map.of("error", "type, symbol 필수"));
            }
            String jobId = service.startCollect(type, symbol, marketType, fromId, toId, fromMs, toMs);
            return ResponseEntity.ok(Map.of("jobId", jobId));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    /** flat 행 삭제 — tableKey: 1s / 1m / 5m, fromMs/toMs: 품질 조회 시 사용한 범위 */
    @DeleteMapping("/flat")
    public ResponseEntity<?> deleteFlat(
            @RequestParam String symbol,
            @RequestParam(defaultValue = "FUTURES") String marketType,
            @RequestParam String tableKey,
            @RequestParam(required = false) Long fromMs,
            @RequestParam(required = false) Long toMs) {
        try {
            Map<String, Object> result = service.deleteFlatData(symbol, marketType, tableKey, fromMs, toMs);
            return ResponseEntity.ok(result);
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    /** 데이터 품질 조회 — raw 대비 1s 불일치 현황 (fromMs~toMs, 기본 최근 1일) */
    @GetMapping("/health")
    public ResponseEntity<?> health(
            @RequestParam String symbol,
            @RequestParam(defaultValue = "FUTURES") String marketType,
            @RequestParam(required = false) Long fromMs,
            @RequestParam(required = false) Long toMs) {
        long now = System.currentTimeMillis();
        long resolvedFrom = (fromMs != null) ? fromMs : now - 86_400_000L;
        long resolvedTo   = (toMs   != null) ? toMs   : now;
        return ResponseEntity.ok(service.getDataHealth(symbol, marketType, resolvedFrom, resolvedTo));
    }

    /** 특정 Job 상태 조회 */
    @GetMapping("/status/{jobId}")
    public ResponseEntity<?> status(@PathVariable String jobId) {
        var job = service.getStatus(jobId);
        if (job == null) return ResponseEntity.notFound().build();
        return ResponseEntity.ok(toMap(job));
    }

    /** 전체 Job 목록 조회 (최신순) */
    @GetMapping("/jobs")
    public ResponseEntity<?> jobs() {
        return ResponseEntity.ok(service.getAllJobs().stream().map(this::toMap).toList());
    }

    private Map<String, Object> toMap(ManualBackfillService.JobStatus j) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("jobId",      j.jobId());
        m.put("type",       j.type());
        m.put("symbol",     j.symbol());
        m.put("marketType", j.marketType());
        m.put("status",     j.status());
        m.put("message",    j.message());
        m.put("startedAt",  j.startedAt());
        m.put("finishedAt", j.finishedAt());
        m.put("inserted",   j.inserted());
        return m;
    }
}
