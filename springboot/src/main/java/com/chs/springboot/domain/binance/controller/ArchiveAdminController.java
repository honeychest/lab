// [AGENT] 역할: S3 아카이빙 수동 실행 어드민 API | 연관파일: S3ArchiveService.java, RawAggTradeRepository.java
// 엔드포인트: POST /api/admin/archive/count (건수 조회), POST /api/admin/archive/run (실행)
package com.chs.springboot.domain.binance.controller;

import com.chs.springboot.domain.binance.repository.RawAggTradeRepository;
import com.chs.springboot.domain.binance.service.S3ArchiveService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
@RequestMapping("/api/admin/archive")
public class ArchiveAdminController {

    private final RawAggTradeRepository rawAggTradeRepository;
    private final S3ArchiveService s3ArchiveService;

    public ArchiveAdminController(RawAggTradeRepository rawAggTradeRepository,
                                  S3ArchiveService s3ArchiveService) {
        this.rawAggTradeRepository = rawAggTradeRepository;
        this.s3ArchiveService = s3ArchiveService;
    }

    /**
     * 아카이빙 실행 전 대상 건수 조회
     * @param req { startMs, endMs }
     */
    @PostMapping("/count")
    public ResponseEntity<Map<String, Object>> count(@RequestBody Map<String, Long> req) {
        long startMs = req.get("startMs");
        long endMs = req.get("endMs");
        long count = rawAggTradeRepository.countByTradedAtRange(startMs, endMs);
        return ResponseEntity.ok(Map.of(
                "startMs", startMs,
                "endMs", endMs,
                "count", count
        ));
    }

    /**
     * 아카이빙 실행 — S3 업로드 후 DB 삭제
     * @param req { startMs, endMs }
     */
    @PostMapping("/run")
    public ResponseEntity<S3ArchiveService.ArchiveResult> run(@RequestBody Map<String, Long> req) {
        long startMs = req.get("startMs");
        long endMs = req.get("endMs");
        S3ArchiveService.ArchiveResult result = s3ArchiveService.archive(startMs, endMs);
        return ResponseEntity.ok(result);
    }
}
