package com.chs.springboot.global.admin.test.auth;

import com.chs.springboot.global.auth.dto.CookieDebugResponse;
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
}
