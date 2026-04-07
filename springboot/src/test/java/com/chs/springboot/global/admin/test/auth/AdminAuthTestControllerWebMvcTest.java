package com.chs.springboot.global.admin.test.auth;

import com.chs.springboot.global.auth.dto.AccessTokenDebugResponse;
import com.chs.springboot.global.auth.dto.CookieDebugResponse;
import com.chs.springboot.global.auth.dto.RefreshTokenDebugResponse;
import com.chs.springboot.global.auth.service.AuthService;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.converter.json.MappingJackson2HttpMessageConverter;
import org.springframework.test.web.servlet.MockMvc;

import java.util.List;

import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static org.springframework.test.web.servlet.setup.MockMvcBuilders.standaloneSetup;

@ExtendWith(MockitoExtension.class)
class AdminAuthTestControllerWebMvcTest {

    @Mock
    private AuthService authService;

    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        AdminAuthTestController controller = new AdminAuthTestController(authService);
        mockMvc = standaloneSetup(controller)
                .setMessageConverters(new MappingJackson2HttpMessageConverter())
                .build();
    }

    @Test
    @DisplayName("POST /debug/refresh-token -> AuthService.getRefreshTokenDebug 위임")
    void refreshTokenDebug_ok() throws Exception {
        RefreshTokenDebugResponse response = new RefreshTokenDebugResponse(
                "auth:refresh:r-token",
                "1",
                120L,
                true
        );
        when(authService.getRefreshTokenDebug("r-token")).thenReturn(response);

        mockMvc.perform(post("/api/admin/test/auth/debug/refresh-token")
                        .contentType("application/json")
                        .content("{\"refreshToken\":\"r-token\"}"))
                .andExpect(status().isOk())
                .andExpect(content().contentTypeCompatibleWith("application/json"))
                .andExpect(jsonPath("$.redisKey").value("auth:refresh:r-token"))
                .andExpect(jsonPath("$.userId").value("1"))
                .andExpect(jsonPath("$.ttlSeconds").value(120))
                .andExpect(jsonPath("$.exists").value(true));

        verify(authService).getRefreshTokenDebug(eq("r-token"));
    }

    @Test
    @DisplayName("POST /debug/access-token -> AuthService.getAccessTokenDebug 위임")
    void accessTokenDebug_ok() throws Exception {
        AccessTokenDebugResponse response = new AccessTokenDebugResponse(
                true,
                "valid",
                "7",
                "admin@example.com",
                List.of("ADMIN_ACCESS"),
                "2026-04-06T00:00:00Z",
                "2026-04-06T01:00:00Z"
        );
        when(authService.getAccessTokenDebug("a-token")).thenReturn(response);

        mockMvc.perform(post("/api/admin/test/auth/debug/access-token")
                        .contentType("application/json")
                        .content("{\"accessToken\":\"a-token\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.valid").value(true))
                .andExpect(jsonPath("$.subject").value("7"))
                .andExpect(jsonPath("$.permissionCodes[0]").value("ADMIN_ACCESS"));

        verify(authService).getAccessTokenDebug(eq("a-token"));
    }

    @Test
    @DisplayName("GET /debug/cookie-info -> 쿠키를 @CookieValue로 전달")
    void cookieDebug_readsCookies() throws Exception {
        CookieDebugResponse response = new CookieDebugResponse(
                new CookieDebugResponse.AccessInfo(true, "99", List.of("ADMIN_ACCESS"), "issued", "expires"),
                new CookieDebugResponse.RefreshInfo(true, 321L)
        );
        when(authService.getCookieDebug("a-cookie", "r-cookie")).thenReturn(response);

        mockMvc.perform(get("/api/admin/test/auth/debug/cookie-info")
                        .cookie(new Cookie("accessToken", "a-cookie"))
                        .cookie(new Cookie("refreshToken", "r-cookie")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.access.valid").value(true))
                .andExpect(jsonPath("$.access.userId").value("99"))
                .andExpect(jsonPath("$.refresh.stored").value(true))
                .andExpect(jsonPath("$.refresh.ttlSeconds").value(321));

        verify(authService).getCookieDebug(eq("a-cookie"), eq("r-cookie"));
    }

    @Test
    @DisplayName("POST /debug/access-token-from-cookie -> access 쿠키로 getAccessTokenDebug")
    void accessTokenFromCookie_ok() throws Exception {
        AccessTokenDebugResponse response = new AccessTokenDebugResponse(
                false,
                "ACCESS_TOKEN_INVALID",
                null,
                null,
                null,
                null,
                null
        );
        when(authService.getAccessTokenDebug("from-c")).thenReturn(response);

        mockMvc.perform(post("/api/admin/test/auth/debug/access-token-from-cookie")
                        .cookie(new Cookie("accessToken", "from-c")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.valid").value(false))
                .andExpect(jsonPath("$.message").value("ACCESS_TOKEN_INVALID"));

        verify(authService).getAccessTokenDebug(eq("from-c"));
    }

    @Test
    @DisplayName("POST /debug/refresh-token-from-cookie -> refresh 쿠키로 getRefreshTokenDebug")
    void refreshTokenFromCookie_ok() throws Exception {
        RefreshTokenDebugResponse response = new RefreshTokenDebugResponse(
                "auth:refresh:x",
                null,
                0L,
                false
        );
        when(authService.getRefreshTokenDebug("from-r")).thenReturn(response);

        mockMvc.perform(post("/api/admin/test/auth/debug/refresh-token-from-cookie")
                        .cookie(new Cookie("refreshToken", "from-r")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.exists").value(false));

        verify(authService).getRefreshTokenDebug(eq("from-r"));
    }

    @Test
    @DisplayName("POST /invalidate-refresh-redis -> refresh 쿠키로 Redis 무효화 위임")
    void invalidateRefreshRedis_only() throws Exception {
        mockMvc.perform(post("/api/admin/test/auth/invalidate-refresh-redis")
                        .cookie(new Cookie("refreshToken", "rt-here")))
                .andExpect(status().isOk());

        verify(authService).invalidateRefreshTokenIfPresent(eq("rt-here"));
    }
}
