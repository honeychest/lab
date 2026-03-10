package com.chs.springboot.domain.binance.controller;

import com.chs.springboot.domain.binance.service.AggTradeConfigService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
@RequestMapping("/admin/aggtrade/config")
public class AggTradeAdminController {

    private final AggTradeConfigService configService;

    public AggTradeAdminController(AggTradeConfigService configService) {
        this.configService = configService;
    }

    @GetMapping
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

    @PatchMapping
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
}

