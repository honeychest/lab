// [AGENT] Admin 테스트 — 인증 디버그 API (/api/admin/test/auth/debug)
// ADMIN_ACCESS 권한 필요 (SecurityConfig /api/admin/** 규칙 적용)
package com.chs.springboot.global.admin.test.auth;

import com.chs.springboot.global.auth.dto.AccessTokenDebugRequest;
import com.chs.springboot.global.auth.dto.AccessTokenDebugResponse;
import com.chs.springboot.global.auth.dto.CookieDebugResponse;
import com.chs.springboot.global.auth.dto.RefreshTokenDebugRequest;
import com.chs.springboot.global.auth.dto.RefreshTokenDebugResponse;
import com.chs.springboot.global.auth.service.AuthService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.CookieValue;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequiredArgsConstructor
@RequestMapping("/api/admin/test/auth")
public class AdminAuthTestController {
    private final AuthService authService;

    @PostMapping("/debug/refresh-token")
    public RefreshTokenDebugResponse refreshTokenDebug(@RequestBody RefreshTokenDebugRequest request) {
        return authService.getRefreshTokenDebug(request.getRefreshToken());
    }

    @PostMapping("/debug/access-token")
    public AccessTokenDebugResponse accessTokenDebug(@RequestBody AccessTokenDebugRequest request) {
        return authService.getAccessTokenDebug(request.getAccessToken());
    }

    @GetMapping("/debug/cookie-info")
    public CookieDebugResponse cookieDebug(
            @CookieValue(name = "accessToken", required = false) String accessToken,
            @CookieValue(name = "refreshToken", required = false) String refreshToken
    ) {
        return authService.getCookieDebug(accessToken, refreshToken);
    }

    /** httpOnly access 쿠키 값으로 access 토큰 디버그 (본문에 토큰 노출 없이 시퀀스 테스트용). */
    @PostMapping("/debug/access-token-from-cookie")
    public AccessTokenDebugResponse accessTokenDebugFromCookie(
            @CookieValue(name = "accessToken", required = false) String accessToken
    ) {
        return authService.getAccessTokenDebug(accessToken);
    }

    /** httpOnly refresh 쿠키 값으로 refresh 토큰 디버그. */
    @PostMapping("/debug/refresh-token-from-cookie")
    public RefreshTokenDebugResponse refreshTokenDebugFromCookie(
            @CookieValue(name = "refreshToken", required = false) String refreshToken
    ) {
        return authService.getRefreshTokenDebug(refreshToken);
    }

    /**
     * Redis의 refresh 매핑만 삭제한다. 쿠키는 유지.
     * Admin Auth 테스트 UI는 /api/auth/* 가 구버전에 없을 수 있어 이 경로를 사용한다.
     */
    @PostMapping("/invalidate-refresh-redis")
    public ResponseEntity<Void> invalidateRefreshRedisOnly(
            @CookieValue(name = "refreshToken", required = false) String refreshToken
    ) {
        authService.invalidateRefreshTokenIfPresent(refreshToken);
        return ResponseEntity.ok().build();
    }
}
