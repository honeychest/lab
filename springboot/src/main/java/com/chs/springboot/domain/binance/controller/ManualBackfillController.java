// [AGENT] 역할: 수동 수집 어드민 API | 연관파일: ManualBackfillService.java
// 엔드포인트: GET /api/admin/backfill/range, POST /api/admin/backfill/collect, GET /api/admin/backfill/status/{jobId}, GET /api/admin/backfill/jobs
// IP 인증: DataGapAdminController와 동일 방식 (binance.threshold.allowed-ips + 127.0.0.1 항상 허용)
package com.chs.springboot.domain.binance.controller;

import com.chs.springboot.domain.binance.service.ManualBackfillService;
import jakarta.servlet.http.HttpServletRequest;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.*;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/admin/backfill")
public class ManualBackfillController {

    private static final Logger log = LoggerFactory.getLogger(ManualBackfillController.class);

    private final ManualBackfillService service;

    @Value("${binance.threshold.allowed-ips:}")
    private String allowedIps;

    public ManualBackfillController(ManualBackfillService service) {
        this.service = service;
    }

    private static String getClientIp(HttpServletRequest request) {
        String xff = request.getHeader("X-Forwarded-For");
        String ip  = (xff != null && !xff.isBlank()) ? xff.split(",")[0].trim() : request.getRemoteAddr();
        if ("0:0:0:0:0:0:0:1".equals(ip) || "::1".equals(ip)) return "127.0.0.1";
        return ip;
    }

    private boolean isAllowed(HttpServletRequest request) {
        String clientIp = getClientIp(request);
        if (allowedIps == null || allowedIps.isBlank()) return true;
        Set<String> allowed = Arrays.stream(allowedIps.split(","))
                .map(String::trim).filter(s -> !s.isEmpty())
                .collect(Collectors.toCollection(HashSet::new));
        allowed.add("127.0.0.1");
        boolean ok = allowed.contains(clientIp);
        log.info("[BackfillAccess] clientIp={} result={}", clientIp, ok ? "허용" : "차단");
        return ok;
    }

    /** 수집 시작 — 비동기, jobId 즉시 반환 */
    @PostMapping("/collect")
    public ResponseEntity<?> collect(@RequestBody Map<String, Object> body, HttpServletRequest request) {
        if (!isAllowed(request)) return forbidden();
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

    /** 특정 Job 상태 조회 */
    @GetMapping("/status/{jobId}")
    public ResponseEntity<?> status(@PathVariable String jobId, HttpServletRequest request) {
        if (!isAllowed(request)) return forbidden();
        var job = service.getStatus(jobId);
        if (job == null) return ResponseEntity.notFound().build();
        return ResponseEntity.ok(toMap(job));
    }

    /** 전체 Job 목록 조회 (최신순) */
    @GetMapping("/jobs")
    public ResponseEntity<?> jobs(HttpServletRequest request) {
        if (!isAllowed(request)) return forbidden();
        return ResponseEntity.ok(service.getAllJobs().stream().map(this::toMap).toList());
    }

    private ResponseEntity<?> forbidden() {
        return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("error", "접근 권한이 없습니다."));
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
