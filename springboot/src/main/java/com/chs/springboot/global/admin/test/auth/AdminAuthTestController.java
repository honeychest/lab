// [AGENT] Admin 테스트 — 쿠키 상태 디버그 API (/api/admin/test/auth/debug/cookie-info)
// ADMIN_ACCESS 권한 필요 (SecurityConfig /api/admin/** 규칙 적용)
package com.chs.springboot.global.admin.test.auth;

import com.chs.springboot.global.auth.dto.CookieDebugResponse;
import com.chs.springboot.global.auth.service.AuthService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.CookieValue;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequiredArgsConstructor
@RequestMapping("/api/admin/test/auth")
public class AdminAuthTestController {

    private final AuthService authService;

    @GetMapping("/debug/cookie-info")
    public CookieDebugResponse cookieDebug(
            @CookieValue(name = "accessToken", required = false) String accessToken,
            @CookieValue(name = "refreshToken", required = false) String refreshToken
    ) {
        return authService.getCookieDebug(accessToken, refreshToken);
    }
}
