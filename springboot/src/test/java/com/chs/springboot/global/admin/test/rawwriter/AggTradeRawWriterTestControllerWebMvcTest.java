package com.chs.springboot.global.admin.test.rawwriter;

import com.chs.springboot.domain.binance.service.rawwriter.AggTradeRawWriterSummaryResponse;
import com.chs.springboot.domain.binance.service.rawwriter.AggTradeRawWriterSummaryStore;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.converter.json.MappingJackson2HttpMessageConverter;
import org.springframework.test.web.servlet.MockMvc;

import java.util.List;

import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static org.springframework.test.web.servlet.setup.MockMvcBuilders.standaloneSetup;

@ExtendWith(MockitoExtension.class)
class AggTradeRawWriterTestControllerWebMvcTest {

    @Mock
    private AggTradeRawWriterSummaryStore summaryStore;

    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        AggTradeRawWriterTestController controller = new AggTradeRawWriterTestController(summaryStore);
        mockMvc = standaloneSetup(controller)
                .setMessageConverters(new MappingJackson2HttpMessageConverter())
                .build();
    }

    @Test
    @DisplayName("GET /dry-run-summaries -> raw-writer 상태와 최근 dry-run summary 반환")
    void dryRunSummaries_returnsStateAndRecentSummaries() throws Exception {
        when(summaryStore.snapshot()).thenReturn(new AggTradeRawWriterSummaryResponse(
                true,
                true,
                List.of()
        ));

        mockMvc.perform(get("/api/admin/test/agg-trade/raw-writer/dry-run-summaries"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.enabled").value(true))
                .andExpect(jsonPath("$.dryRun").value(true))
                .andExpect(jsonPath("$.summaries").isArray());
    }

    @Test
    @DisplayName("GET /dry-run-summaries -> Kafka window와 DB 비교 지표 반환")
    void dryRunSummaries_returnsKafkaAndDbWindowComparison() throws Exception {
        when(summaryStore.snapshot()).thenReturn(AggTradeRawWriterSummaryResponse.sampleComparedWindow());

        mockMvc.perform(get("/api/admin/test/agg-trade/raw-writer/dry-run-summaries"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.summaries[0].windowStartMs").value(1778410000000L))
                .andExpect(jsonPath("$.summaries[0].windowEndMs").value(1778410010000L))
                .andExpect(jsonPath("$.summaries[0].kafkaCount").value(412))
                .andExpect(jsonPath("$.summaries[0].dbCount").value(412))
                .andExpect(jsonPath("$.summaries[0].countMatched").value(true))
                .andExpect(jsonPath("$.summaries[0].rangeMatched").value(true));
    }
}
