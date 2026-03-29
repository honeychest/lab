package com.chs.springboot.domain.binance.controller;

import com.chs.springboot.domain.binance.service.BinanceTradeQueryService;
import com.chs.springboot.domain.binance.service.BinanceTradeService;
import com.chs.springboot.domain.binance.service.BinanceTradeSseService;
import com.chs.springboot.domain.binance.service.RawTickSseService;
import com.chs.springboot.global.feature.FeatureFlagService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.converter.json.MappingJackson2HttpMessageConverter;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.servlet.MockMvc;

import java.math.BigDecimal;
import java.util.Collections;

import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import static org.springframework.test.web.servlet.setup.MockMvcBuilders.standaloneSetup;

/**
 * BinanceTradeController — MockMvc standalone (전체 웹 슬라이스 없이 HTTP 계약만 검증)
 */
@ExtendWith(MockitoExtension.class)
class BinanceTradeControllerWebMvcTest {

    @Mock
    BinanceTradeSseService sseService;
    @Mock
    RawTickSseService rawTickSseService;
    @Mock
    BinanceTradeQueryService queryService;
    @Mock
    BinanceTradeService tradeService;
    @Mock
    FeatureFlagService featureFlagService;

    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        BinanceTradeController controller = new BinanceTradeController(
                sseService,
                rawTickSseService,
                queryService,
                tradeService,
                featureFlagService);
        ReflectionTestUtils.setField(controller, "thresholdAllowedIps", "");
        mockMvc = standaloneSetup(controller)
                .setMessageConverters(new MappingJackson2HttpMessageConverter())
                .build();
    }

    @Test
    @DisplayName("GET /recent 기본 limit → queryService.getRecent(100)")
    void getRecent_defaultLimit() throws Exception {
        when(queryService.getRecent(100)).thenReturn(Collections.emptyList());

        mockMvc.perform(get("/api/binance/trades/recent"))
                .andExpect(status().isOk())
                .andExpect(content().contentTypeCompatibleWith("application/json"));

        verify(queryService).getRecent(100);
    }

    @Test
    @DisplayName("GET /recent?limit=50 → getRecent(50)")
    void getRecent_customLimit() throws Exception {
        when(queryService.getRecent(50)).thenReturn(Collections.emptyList());

        mockMvc.perform(get("/api/binance/trades/recent").param("limit", "50"))
                .andExpect(status().isOk());

        verify(queryService).getRecent(50);
    }

    @Test
    @DisplayName("GET /recent?before=99 → getRecentBefore")
    void getRecent_withBefore() throws Exception {
        when(queryService.getRecentBefore(99L, 100)).thenReturn(Collections.emptyList());

        mockMvc.perform(get("/api/binance/trades/recent").param("before", "99"))
                .andExpect(status().isOk());

        verify(queryService).getRecentBefore(99L, 100);
    }

    @Test
    @DisplayName("GET 페이지 — 잘못된 날짜 → 400 + error 메시지")
    void getPage_invalidDate_badRequest() throws Exception {
        when(queryService.getPage(
                isNull(), isNull(), eq("2024/01/15"), isNull(),
                eq("tradedAt"), eq("DESC"), eq(0), eq(30)))
                .thenThrow(new IllegalArgumentException("날짜는 yyyy-MM-dd 형식이어야 합니다"));

        mockMvc.perform(get("/api/binance/trades")
                        .param("from", "2024/01/15"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").exists());
    }

    @Test
    @DisplayName("GET /threshold — value·canEdit JSON")
    void getThreshold_ok() throws Exception {
        when(tradeService.getThreshold()).thenReturn(new BigDecimal("50000"));
        when(featureFlagService.isTradeThresholdEditEnabled()).thenReturn(false);

        mockMvc.perform(get("/api/binance/trades/threshold"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.value").value(50000))
                .andExpect(jsonPath("$.canEdit").value(false));
    }

    @Test
    @DisplayName("POST /threshold — canEdit false → 403")
    void postThreshold_forbiddenWhenCannotEdit() throws Exception {
        when(featureFlagService.isTradeThresholdEditEnabled()).thenReturn(false);

        mockMvc.perform(post("/api/binance/trades/threshold").param("value", "100"))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error").value("권한 없음"));
    }

    @Test
    @DisplayName("POST /threshold — value<=0 → 400")
    void postThreshold_nonPositive_badRequest() throws Exception {
        when(featureFlagService.isTradeThresholdEditEnabled()).thenReturn(true);

        mockMvc.perform(post("/api/binance/trades/threshold").param("value", "0"))
                .andExpect(status().isBadRequest());
    }
}
