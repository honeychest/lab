// [AGENT] 역할: S3 아카이빙 어드민 API | 연관파일: S3ArchiveService.java, ArchiveScanService.java, RawAggTradeRepository.java
// 엔드포인트: POST /api/admin/archive/count (건수 조회)
//             POST /api/admin/archive/upload (업로드+INSERT만, 삭제 없음 — AdminPage 테스트용)
//             POST /api/admin/archive/run    (업로드+삭제 전체 실행)
//             POST /api/admin/archive/scan   (S3 기존 파일 스캔 → DB 초기화)
//             GET  /api/admin/archive/scan-preview (S3 파일 목록 미리보기, DB INSERT 없음)
package com.chs.springboot.domain.binance.controller;

import com.chs.springboot.domain.binance.repository.RawAggTradeRepository;
import com.chs.springboot.domain.binance.service.ArchiveScanService;
import com.chs.springboot.domain.binance.service.RawAggTradeArchiveScheduler;
import com.chs.springboot.domain.binance.service.S3ArchiveService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/admin/archive")
public class ArchiveAdminController {

    private final RawAggTradeRepository rawAggTradeRepository;
    private final S3ArchiveService s3ArchiveService;
    private final ArchiveScanService archiveScanService;
    private final RawAggTradeArchiveScheduler archiveScheduler;

    public ArchiveAdminController(RawAggTradeRepository rawAggTradeRepository,
                                  S3ArchiveService s3ArchiveService,
                                  ArchiveScanService archiveScanService,
                                  RawAggTradeArchiveScheduler archiveScheduler) {
        this.rawAggTradeRepository = rawAggTradeRepository;
        this.s3ArchiveService = s3ArchiveService;
        this.archiveScanService = archiveScanService;
        this.archiveScheduler = archiveScheduler;
    }

    /** 아카이빙 실행 전 대상 건수 조회 */
    @PostMapping("/count")
    public ResponseEntity<Map<String, Object>> count(@RequestBody Map<String, Long> req) {
        long startMs = req.get("startMs");
        long endMs   = req.get("endMs");
        long count   = rawAggTradeRepository.countByTradedAtRange(startMs, endMs);
        return ResponseEntity.ok(Map.of("startMs", startMs, "endMs", endMs, "count", count));
    }

    /**
     * S3 업로드 + archive_log INSERT(complete='N') 만 실행. 삭제 없음.
     * AdminPage 테스트용 — 삭제 전 상태 확인.
     */
    @PostMapping("/upload")
    public ResponseEntity<S3ArchiveService.UploadResult> upload(@RequestBody Map<String, Long> req) {
        long startMs = req.get("startMs");
        long endMs   = req.get("endMs");
        S3ArchiveService.UploadResult result = s3ArchiveService.uploadAndLog(startMs, endMs, "MANUAL");
        return ResponseEntity.ok(result);
    }

    /** 업로드 + 삭제 전체 실행 */
    @PostMapping("/run")
    public ResponseEntity<S3ArchiveService.ArchiveResult> run(@RequestBody Map<String, Long> req) {
        long startMs = req.get("startMs");
        long endMs   = req.get("endMs");
        S3ArchiveService.ArchiveResult result = s3ArchiveService.archive(startMs, endMs, "MANUAL");
        return ResponseEntity.ok(result);
    }

    /** S3 파일 목록 미리보기 (DB INSERT 없음) */
    @GetMapping("/scan-preview")
    public ResponseEntity<List<ArchiveScanService.S3FileInfo>> scanPreview() {
        List<ArchiveScanService.S3FileInfo> files = archiveScanService.listS3Files();
        return ResponseEntity.ok(files);
    }

    /** S3 기존 파일 스캔 → s3_archive_log 초기화 (1회용) */
    @PostMapping("/scan")
    public ResponseEntity<ArchiveScanService.ScanResult> scan() {
        ArchiveScanService.ScanResult result = archiveScanService.scan();
        return ResponseEntity.ok(result);
    }

    /** 아카이브 스케줄러 상태 조회 */
    @GetMapping("/scheduler-status")
    public ResponseEntity<Map<String, Object>> schedulerStatus() {
        return ResponseEntity.ok(Map.of(
                "disabled", archiveScheduler.isDisabled(),
                "consecutiveFailures", archiveScheduler.getConsecutiveFailures(),
                "lastFailureMessage", archiveScheduler.getLastFailureMessage() != null
                        ? archiveScheduler.getLastFailureMessage() : ""
        ));
    }

    /** 아카이브 스케줄러 수동 리셋 (S3 연속 실패로 비활성화된 경우) */
    @PostMapping("/scheduler-reset")
    public ResponseEntity<Map<String, String>> schedulerReset() {
        archiveScheduler.reset();
        return ResponseEntity.ok(Map.of("status", "reset_complete"));
    }
}
