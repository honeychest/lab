package com.chs.springboot.global.auth.controller;

import com.chs.springboot.global.auth.AuthExceptionHandler;
import com.chs.springboot.global.auth.exception.AuthException;
import com.chs.springboot.global.auth.service.AuthService;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.converter.json.MappingJackson2HttpMessageConverter;
import org.springframework.test.web.servlet.MockMvc;

import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static org.springframework.test.web.servlet.setup.MockMvcBuilders.standaloneSetup;

@ExtendWith(MockitoExtension.class)
class AuthControllerWebMvcTest {

    @Mock
    private AuthService authService;

    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        AuthController controller = new AuthController(authService);
        mockMvc = standaloneSetup(controller)
                .setControllerAdvice(new AuthExceptionHandler())
                .setMessageConverters(new MappingJackson2HttpMessageConverter())
                .build();
    }

    @Test
    @DisplayName("POST /login 실패 — 401 + AUTH_LOGIN_FAILED")
    void login_failed_returnsAuthCode() throws Exception {
        when(authService.login("a@b.com", "wrong")).thenThrow(
                new AuthException("이메일 또는 비밀번호가 올바르지 않습니다.", "AUTH_LOGIN_FAILED"));

        mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"a@b.com\",\"password\":\"wrong\"}"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.errorCode").value("AUTH_LOGIN_FAILED"))
                .andExpect(jsonPath("$.message").exists());
    }

    @Test
    @DisplayName("POST /login 비활성 계정 — 403 + AUTH_ACCOUNT_DISABLED")
    void login_disabled_returnsAuthCode() throws Exception {
        when(authService.login("a@b.com", "pw")).thenThrow(
                new AuthException(
                        "비활성화 된 계정입니다. 관리자에게 문의해주세요.",
                        "AUTH_ACCOUNT_DISABLED",
                        HttpStatus.FORBIDDEN
                ));

        mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"a@b.com\",\"password\":\"pw\"}"))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.errorCode").value("AUTH_ACCOUNT_DISABLED"));
    }

    @Test
    @DisplayName("POST /refresh — 유효하지 않은 토큰 AUTH_REFRESH_INVALID")
    void refresh_invalidToken_returnsAuthCode() throws Exception {
        when(authService.refreshAccessToken("rt")).thenThrow(
                new AuthException("유효하지 않은 refresh token 입니다.", "AUTH_REFRESH_INVALID"));

        mockMvc.perform(post("/api/auth/refresh")
                        .cookie(new Cookie("refreshToken", "rt")))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.errorCode").value("AUTH_REFRESH_INVALID"));
    }

    @Test
    @DisplayName("POST /refresh — Redis 없음 AUTH_REFRESH_NOT_FOUND")
    void refresh_notInRedis_returnsAuthCode() throws Exception {
        when(authService.refreshAccessToken("rt")).thenThrow(
                new AuthException("만료되었거나 존재하지 않는 refresh token 입니다.", "AUTH_REFRESH_NOT_FOUND"));

        mockMvc.perform(post("/api/auth/refresh")
                        .cookie(new Cookie("refreshToken", "rt")))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.errorCode").value("AUTH_REFRESH_NOT_FOUND"));
    }

    @Test
    @DisplayName("POST /logout — refresh 쿠키 없으면 무효화 메서드에 null 전달")
    void logout_withoutRefreshCookie_ok() throws Exception {
        mockMvc.perform(post("/api/auth/logout"))
                .andExpect(status().isOk());

        verify(authService).invalidateRefreshTokenIfPresent(isNull());
    }

    @Test
    @DisplayName("POST /logout — refresh 쿠키 있으면 무효화 후 200")
    void logout_withRefreshCookie_invalidates() throws Exception {
        mockMvc.perform(post("/api/auth/logout")
                        .cookie(new Cookie("refreshToken", "rt-1")))
                .andExpect(status().isOk());

        verify(authService).invalidateRefreshTokenIfPresent(eq("rt-1"));
    }

    @Test
    @DisplayName("POST /invalidate-refresh — 쿠키 없으면 무효화에 null 전달")
    void invalidateRefresh_withoutCookie() throws Exception {
        mockMvc.perform(post("/api/auth/invalidate-refresh"))
                .andExpect(status().isOk());

        verify(authService).invalidateRefreshTokenIfPresent(isNull());
    }

    @Test
    @DisplayName("POST /refresh — 정상 시 access 쿠키 설정")
    void refresh_ok() throws Exception {
        when(authService.refreshAccessToken("rt")).thenReturn("new-access");

        mockMvc.perform(post("/api/auth/refresh")
                        .cookie(new Cookie("refreshToken", "rt")))
                .andExpect(status().isOk());

        verify(authService).refreshAccessToken("rt");
    }
}
