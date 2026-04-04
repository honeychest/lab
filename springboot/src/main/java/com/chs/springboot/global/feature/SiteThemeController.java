package com.chs.springboot.global.feature;

import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequiredArgsConstructor
@RequestMapping("/api")
public class SiteThemeController {

    private final SiteThemeService siteThemeService;

    /** 공개 — 모든 방문자가 현재 테마 조회 */
    @GetMapping("/site-theme")
    public ResponseEntity<Map<String, String>> getThemes() {
        return ResponseEntity.ok(siteThemeService.getAll());
    }

    /** 페이지별 테마 변경 — TODO: admin 인증 완성 후 /api/admin/site-theme 로 복귀 */
    @PatchMapping("/site-theme")
    public ResponseEntity<Map<String, String>> patchThemes(@RequestBody Map<String, String> req) {
        for (Map.Entry<String, String> entry : req.entrySet()) {
            siteThemeService.setTheme(entry.getKey(), entry.getValue());
        }
        return ResponseEntity.ok(siteThemeService.getAll());
    }
}
