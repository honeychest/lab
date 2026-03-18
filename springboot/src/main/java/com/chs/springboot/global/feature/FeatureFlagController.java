package com.chs.springboot.global.feature;

import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequiredArgsConstructor
@RequestMapping("/api")
public class FeatureFlagController {

    private final FeatureFlagService featureFlagService;

    @GetMapping("/feature-flags")
    public ResponseEntity<Map<String, Boolean>> getPublic() {
        return ResponseEntity.ok(featureFlagService.getAll());
    }

    @GetMapping("/admin/feature-flags")
    public ResponseEntity<Map<String, Boolean>> getAdmin() {
        return ResponseEntity.ok(featureFlagService.getAll());
    }

    @PatchMapping("/admin/feature-flags")
    public ResponseEntity<Map<String, Boolean>> patch(@RequestBody Map<String, Boolean> req) {
        featureFlagService.setTradeThresholdEdit(req.get("tradeThresholdEdit"));
        featureFlagService.setMonitorAllowedIpManage(req.get("monitorAllowedIpManage"));
        return ResponseEntity.ok(featureFlagService.getAll());
    }
}

