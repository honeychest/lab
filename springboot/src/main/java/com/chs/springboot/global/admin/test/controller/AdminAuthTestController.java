// [AGENT] Admin 테스트 — 인증 디버그 API (/api/admin/test/auth/debug)
// ADMIN_ACCESS 권한 필요 (SecurityConfig /api/admin/** 규칙 적용)
package com.chs.springboot.global.admin.test.controller;

import com.chs.springboot.global.auth.dto.AccessTokenDebugRequest;
import com.chs.springboot.global.auth.dto.AccessTokenDebugResponse;
import com.chs.springboot.global.auth.dto.CookieDebugResponse;
import com.chs.springboot.global.auth.dto.RefreshTokenDebugRequest;
import com.chs.springboot.global.auth.dto.RefreshTokenDebugResponse;
import com.chs.springboot.global.auth.service.AuthService;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.bind.annotation.GetMapping;
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

    // body로 토큰을 직접 전달하는 디버그 (Postman 등 외부 도구에서 사용)
    @PostMapping("/debug/refresh-token")
    public RefreshTokenDebugResponse refreshTokenDebug(@RequestBody RefreshTokenDebugRequest request) {
        return authService.getRefreshTokenDebug(request.getRefreshToken());
    }

    @PostMapping("/debug/access-token")
    public AccessTokenDebugResponse accessTokenDebug(@RequestBody AccessTokenDebugRequest request) {
        return authService.getAccessTokenDebug(request.getAccessToken());
    }

    // httpOnly 쿠키에서 토큰을 읽어 디버그 정보 반환 (테스트 페이지용)
    // 이 엔드포인트 자체가 ADMIN_ACCESS 권한을 요구하므로 쿠키 인증이 선행되어야 접근 가능
    @GetMapping("/debug/cookie-info")
    public CookieDebugResponse cookieDebug(HttpServletRequest request) {
        String accessToken = null;
        String refreshToken = null;
        Cookie[] cookies = request.getCookies();
        if (cookies != null) {
            for (Cookie cookie : cookies) {
                if ("accessToken".equals(cookie.getName())) {
                    accessToken = cookie.getValue();
                } else if ("refreshToken".equals(cookie.getName())) {
                    refreshToken = cookie.getValue();
                }
            }
        }
        return authService.getCookieDebug(accessToken, refreshToken);
    }
}
