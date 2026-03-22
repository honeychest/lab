// [AGENT] 역할: aggTrade 수집 설정 + 수동 롤업 어드민 API | 연관파일: AggTradeConfigService.java, AggTradeRollupService.java
// 엔드포인트: GET /api/admin/aggtrade/config (현재 설정 조회), PATCH /api/admin/aggtrade/config (설정 변경)
//             POST /api/admin/aggtrade/rollup { fromMs, toMs } (1s→1m→5m 수동 롤업 실행)
package com.chs.springboot.domain.binance.controller;

import com.chs.springboot.domain.binance.service.AggTradeConfigService;
import com.chs.springboot.domain.binance.service.AggTradeRollupService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
@RequestMapping("/api/admin/aggtrade")
public class AggTradeAdminController {

    private final AggTradeConfigService configService;
    private final AggTradeRollupService rollupService;

    public AggTradeAdminController(AggTradeConfigService configService,
                                   AggTradeRollupService rollupService) {
        this.configService = configService;
        this.rollupService = rollupService;
    }

    @GetMapping("/config")
    public ResponseEntity<Map<String, Object>> getConfig() {
        Map<String, Object> body = Map.of(
                "maxQueueSize", configService.getMaxQueueSize(),
                "flushThreshold", configService.getFlushThreshold(),
                "batchSize", configService.getBatchSize(),
                "flushIntervalSec", configService.getFlushIntervalSec(),
                "dedupTtlSec", configService.getDedupTtlSec(),
                "weightPerMinute", configService.getWeightPerMinute()
        );
        return ResponseEntity.ok(body);
    }

    @PatchMapping("/config")
    public ResponseEntity<Void> updateConfig(@RequestBody Map<String, Integer> req) {
        if (req.containsKey("maxQueueSize")) {
            configService.updateMaxQueueSize(req.get("maxQueueSize"));
        }
        if (req.containsKey("flushThreshold")) {
            configService.updateFlushThreshold(req.get("flushThreshold"));
        }
        if (req.containsKey("batchSize")) {
            configService.updateBatchSize(req.get("batchSize"));
        }
        if (req.containsKey("flushIntervalSec")) {
            configService.updateFlushIntervalSec(req.get("flushIntervalSec"));
        }
        if (req.containsKey("dedupTtlSec")) {
            configService.updateDedupTtlSec(req.get("dedupTtlSec"));
        }
        if (req.containsKey("weightPerMinute")) {
            configService.updateWeightPerMinute(req.get("weightPerMinute"));
        }
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/rollup")
    public ResponseEntity<Map<String, Object>> triggerRollup(@RequestBody Map<String, Long> req) {
        long now    = System.currentTimeMillis();
        long fromMs = req.getOrDefault("fromMs", now - 7 * 24 * 60 * 60 * 1000L);
        long toMs   = req.getOrDefault("toMs",   now);
        try {
            Map<String, Integer> result = rollupService.rollupRange(fromMs, toMs);
            return ResponseEntity.ok(Map.of(
                    "inserted1m", (Object) result.get("inserted1m"),
                    "inserted5m", (Object) result.get("inserted5m")
            ));
        } catch (IllegalStateException e) {
            return ResponseEntity.status(409).body(Map.of("error", (Object) e.getMessage()));
        }
    }
}

