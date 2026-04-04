// [AGENT] Admin 테스트 — 인증 디버그 API (/api/admin/test/auth/debug)
// ADMIN_ACCESS 권한 필요 (SecurityConfig /api/admin/** 규칙 적용)
package com.chs.springboot.global.admin.test.controller;

import com.chs.springboot.global.auth.dto.AccessTokenDebugRequest;
import com.chs.springboot.global.auth.dto.AccessTokenDebugResponse;
import com.chs.springboot.global.auth.dto.RefreshTokenDebugRequest;
import com.chs.springboot.global.auth.dto.RefreshTokenDebugResponse;
import com.chs.springboot.global.auth.service.AuthService;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/admin/test/auth")
public class AdminAuthTestController {
    private final AuthService authService;

    public AdminAuthTestController(AuthService authService) {
        this.authService = authService;
    }

    @PostMapping("/debug/refresh-token")
    public RefreshTokenDebugResponse refreshTokenDebug(@RequestBody RefreshTokenDebugRequest request) {
        return authService.getRefreshTokenDebug(request.getRefreshToken());
    }

    @PostMapping("/debug/access-token")
    public AccessTokenDebugResponse accessTokenDebug(@RequestBody AccessTokenDebugRequest request) {
        return authService.getAccessTokenDebug(request.getAccessToken());
    }
}
