// [AGENT] 인증 API 컨트롤러 — /api/auth/login 요청을 받아 토큰 쌍을 반환
package com.chs.springboot.global.auth.controller;

import com.chs.springboot.global.auth.dto.AuthTokenPair;
import com.chs.springboot.global.auth.dto.LoginRequest;
import com.chs.springboot.global.auth.service.AuthService;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.CookieValue;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController /*json 응답하는 controller 라는뜻. @controller 는 view 로 해석함(리턴값에 맞는 화면을 찾아버림).
                        그래서 @controller 쓰고 json 값이 필요하면 @ResponseBody 를 붙여주고 쓰는것임.*/
@RequestMapping("/api/auth") // /api/auth 로 시작하는 공통 경로를 이 컨트롤러가 담당 그중에 @PostMapping("login") 으로 끝나는 메서드에 매칭되는 방식
public class AuthController {
    private final AuthService authService;
    public AuthController(AuthService authService) {
        this.authService = authService;
    }
    @PostMapping("/login")
    public ResponseEntity<Void> login(@RequestBody LoginRequest loginRequest, HttpServletResponse response) { //  @RequestBody = 요청 body를 자바 객체로 받는 것 여기선 json 형식을 객체로 바꿔줌
        AuthTokenPair authTokenPair = authService.login(loginRequest.getEmail(), loginRequest.getPassword());
        if (authTokenPair != null) {
            Cookie accessCookie = new Cookie("accessToken", authTokenPair.getAccessToken());
            accessCookie.setHttpOnly(true); // // JS(document.cookie)에서 이 쿠키를 읽을 수 없게 함. XSS 공격으로 토큰 탈취 방지.
            accessCookie.setPath("/"); // 이 쿠키를 전송할 경로 범위. "/" 는 모든 경로에서 쿠키를 전송함. "/api" 로 하면 /api/** 요청에만 쿠키가 붙어서 감.
            response.addCookie(accessCookie);
            Cookie refreshCookie = new Cookie("refreshToken", authTokenPair.getRefreshToken());
            refreshCookie.setHttpOnly(true);
            refreshCookie.setPath("/");
            response.addCookie(refreshCookie);
        }
        return ResponseEntity.ok().build();
    }

    @PostMapping("/refresh")
    public ResponseEntity<Void> refresh(@CookieValue(name = "refreshToken", required = false) String refreshToken,
                                        HttpServletResponse response) {
        if (refreshToken == null) {
            return ResponseEntity.status(401).build();
        }
        String newAccessToken = authService.refreshAccessToken(refreshToken);
        Cookie accessCookie = new Cookie("accessToken", newAccessToken);
        accessCookie.setHttpOnly(true);
        accessCookie.setPath("/");
        response.addCookie(accessCookie);
        return ResponseEntity.ok().build();
    }

    @PostMapping("/logout")
    public ResponseEntity<Void> logout(
            @CookieValue(name = "refreshToken", required = false) String refreshToken,
            HttpServletResponse response
    ) {
        authService.invalidateRefreshTokenIfPresent(refreshToken);
        addExpiredCookie(response, "accessToken");
        addExpiredCookie(response, "refreshToken");
        return ResponseEntity.ok().build();
    }

    /**
     * refresh 쿠키 값에 해당하는 Redis 항목만 삭제한다. 쿠키는 브라우저에 남는다(무효화 후 동작 확인용).
     */
    @PostMapping("/invalidate-refresh")
    public ResponseEntity<Void> invalidateRefresh(
            @CookieValue(name = "refreshToken", required = false) String refreshToken
    ) {
        authService.invalidateRefreshTokenIfPresent(refreshToken);
        return ResponseEntity.ok().build();
    }

    private static void addExpiredCookie(HttpServletResponse response, String name) {
        Cookie cookie = new Cookie(name, "");
        cookie.setHttpOnly(true);
        cookie.setPath("/");
        cookie.setMaxAge(0);
        response.addCookie(cookie);
    }

}
