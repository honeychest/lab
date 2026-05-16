package com.chs.springboot.global.admin.test.rawwriter;

import com.chs.springboot.domain.binance.service.rawwriter.AggTradeRawWriterSummaryResponse;
import com.chs.springboot.domain.binance.service.rawwriter.AggTradeRawWriterDryRunVerifier;
import com.chs.springboot.domain.binance.service.rawwriter.AggTradeRawWriterKafkaPartitionSnapshot;
import com.chs.springboot.domain.binance.service.rawwriter.AggTradeRawWriterKafkaFailureSample;
import com.chs.springboot.domain.binance.service.rawwriter.AggTradeRawWriterKafkaTelemetryResponse;
import com.chs.springboot.domain.binance.service.rawwriter.AggTradeRawWriterKafkaTelemetryService;
import com.chs.springboot.domain.binance.service.rawwriter.AggTradeRawWriterKafkaTelemetrySummary;
import com.chs.springboot.domain.binance.service.rawwriter.AggTradeRawWriterKafkaTelemetryWindow;
import com.chs.springboot.domain.binance.service.rawwriter.AggTradeRawWriterKafkaTelemetryWindowsResponse;
import com.chs.springboot.domain.binance.service.rawwriter.AggTradeRawWriterKafkaTopicSnapshot;
import com.chs.springboot.global.admin.test.shadow.TableShadowCompareResponse;
import com.chs.springboot.global.admin.test.shadow.TableShadowCompareRow;
import com.chs.springboot.global.admin.test.shadow.TableShadowMultiCompareResponse;
import com.chs.springboot.global.admin.test.shadow.TableShadowProfile;
import com.chs.springboot.global.admin.test.shadow.TableShadowWindowSummary;
import com.chs.springboot.global.admin.test.shadow.TableShadowVerifier;
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
    private AggTradeRawWriterDryRunVerifier summaryStore;
    @Mock
    private TableShadowVerifier shadowVerifier;
    @Mock
    private AggTradeRawWriterKafkaTelemetryService telemetryService;

    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        AggTradeRawWriterTestController controller = new AggTradeRawWriterTestController(summaryStore, shadowVerifier, telemetryService);
        mockMvc = standaloneSetup(controller)
                .setMessageConverters(new MappingJackson2HttpMessageConverter())
                .build();
    }

    @Test
    @DisplayName("GET /dry-run-summaries -> raw-writer 상태와 최근 dry-run summary 반환")
    void dryRunSummaries_returnsStateAndRecentSummaries() throws Exception {
        when(summaryStore.snapshot()).thenReturn(new AggTradeRawWriterSummaryResponse(
                "dry-run",
                true,
                true,
                null,
                List.of()
        ));

        mockMvc.perform(get("/api/admin/test/agg-trade/raw-writer/dry-run-summaries"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.mode").value("dry-run"))
                .andExpect(jsonPath("$.enabled").value(true))
                .andExpect(jsonPath("$.dryRun").value(true))
                .andExpect(jsonPath("$.targetTable").doesNotExist())
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

    @Test
    @DisplayName("GET /shadow-comparison -> 운영 테이블과 shadow 테이블 비교 지표 반환")
    void shadowComparison_returnsRawAndShadowTableComparison() throws Exception {
        when(shadowVerifier.compareRecent(TableShadowProfile.AGG_TRADE_RAW, 60, 20)).thenReturn(new TableShadowCompareResponse(
                "agg-trade-raw",
                60,
                20,
                List.of(new TableShadowCompareRow(
                        "BTCUSDT",
                        "FUTURES",
                        100,
                        98,
                        2,
                        95,
                        94,
                        5,
                        4,
                        10L,
                        109L,
                        10L,
                        107L,
                        "CHECK"
                ))
        ));

        mockMvc.perform(get("/api/admin/test/agg-trade/raw-writer/shadow-comparison")
                        .param("minutes", "60"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.profile").value("agg-trade-raw"))
                .andExpect(jsonPath("$.minutes").value(60))
                .andExpect(jsonPath("$.graceSeconds").value(20))
                .andExpect(jsonPath("$.rows[0].symbol").value("BTCUSDT"))
                .andExpect(jsonPath("$.rows[0].marketType").value("FUTURES"))
                .andExpect(jsonPath("$.rows[0].rawCount").value(100))
                .andExpect(jsonPath("$.rows[0].shadowCount").value(98))
                .andExpect(jsonPath("$.rows[0].countDelta").value(2))
                .andExpect(jsonPath("$.rows[0].rawDistinctSequenceCount").value(95))
                .andExpect(jsonPath("$.rows[0].shadowDistinctSequenceCount").value(94))
                .andExpect(jsonPath("$.rows[0].rawDuplicateCount").value(5))
                .andExpect(jsonPath("$.rows[0].shadowDuplicateCount").value(4))
                .andExpect(jsonPath("$.rows[0].status").value("CHECK"));
    }

    @Test
    @DisplayName("GET /shadow-comparison/windows -> 다중 시간창 비교 요약 반환")
    void shadowComparisonWindows_returnsWindowSummaries() throws Exception {
        when(shadowVerifier.compareRecentWindows(TableShadowProfile.AGG_TRADE_RAW, List.of(5, 15, 60), 20))
                .thenReturn(new TableShadowMultiCompareResponse(
                        "agg-trade-raw",
                        List.of(
                                new TableShadowWindowSummary(5, 20, 4, 1, -1),
                                new TableShadowWindowSummary(15, 20, 4, 2, -3),
                                new TableShadowWindowSummary(60, 20, 4, 3, -6)
                        )
                ));

        mockMvc.perform(get("/api/admin/test/agg-trade/raw-writer/shadow-comparison/windows")
                        .param("minutes", "5,15,60"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.profile").value("agg-trade-raw"))
                .andExpect(jsonPath("$.windows[0].minutes").value(5))
                .andExpect(jsonPath("$.windows[0].graceSeconds").value(20))
                .andExpect(jsonPath("$.windows[0].totalRows").value(4))
                .andExpect(jsonPath("$.windows[0].checkRows").value(1))
                .andExpect(jsonPath("$.windows[0].totalDelta").value(-1))
                .andExpect(jsonPath("$.windows[2].minutes").value(60))
                .andExpect(jsonPath("$.windows[2].checkRows").value(3));
    }

    @Test
    @DisplayName("GET /kafka-observability -> Kafka lag/DLQ/처리량 요약 반환")
    void kafkaObservability_returnsKafkaTelemetrySummary() throws Exception {
        when(telemetryService.snapshot()).thenReturn(new AggTradeRawWriterKafkaTelemetryResponse(
                "DEBUG",
                true,
                false,
                "raw_agg_trade_test",
                true,
                "raw-writer-local",
                "localhost:9094",
                1200,
                1195,
                3,
                3,
                0,
                2,
                12,
                2,
                1778410010000L,
                1778410020000L,
                "db down",
                new AggTradeRawWriterKafkaTelemetrySummary(
                        new AggTradeRawWriterKafkaTelemetryWindow(1778410000000L, 1778410060000L, 100, 99, 1, 1, 0, 0, 5, 1),
                        100,
                        1,
                        1,
                        0,
                        1
                ),
                List.of(new AggTradeRawWriterKafkaFailureSample(
                        1778410020000L,
                        "INVALID",
                        "BTCUSDT",
                        "FUTURES",
                        1,
                        7L,
                        "Missing payload.a"
                )),
                new AggTradeRawWriterKafkaTopicSnapshot(
                        "market.aggtrade.raw",
                        2,
                        5000L,
                        4900L,
                        100L,
                        null,
                        List.of(new AggTradeRawWriterKafkaPartitionSnapshot(0, 2500L, 2450L, 50L))
                ),
                new AggTradeRawWriterKafkaTopicSnapshot(
                        "market.aggtrade.dlq",
                        1,
                        3L,
                        null,
                        null,
                        null,
                        List.of(new AggTradeRawWriterKafkaPartitionSnapshot(0, 3L, null, null))
                )
        ));

        mockMvc.perform(get("/api/admin/test/agg-trade/raw-writer/kafka-observability"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.mode").value("DEBUG"))
                .andExpect(jsonPath("$.listenerRunning").value(true))
                .andExpect(jsonPath("$.consumerGroupId").value("raw-writer-local"))
                .andExpect(jsonPath("$.summary.peakConsumedRecords").value(100))
                .andExpect(jsonPath("$.summary.worstWindow.failedBatches").value(1))
                .andExpect(jsonPath("$.recentFailures[0].failureType").value("INVALID"))
                .andExpect(jsonPath("$.rawTopic.topic").value("market.aggtrade.raw"))
                .andExpect(jsonPath("$.rawTopic.lagSum").value(100))
                .andExpect(jsonPath("$.dlqTopic.latestOffsetSum").value(3))
                .andExpect(jsonPath("$.totalInvalidRecords").value(3));
    }

    @Test
    @DisplayName("GET /kafka-observability/windows -> 시간 버킷별 Kafka 처리량 반환")
    void kafkaObservabilityWindows_returnsKafkaTelemetryWindows() throws Exception {
        when(telemetryService.windows(60, 60)).thenReturn(new AggTradeRawWriterKafkaTelemetryWindowsResponse(
                60,
                60,
                List.of(
                        new AggTradeRawWriterKafkaTelemetryWindow(1778410000000L, 1778410060000L, 100, 99, 1, 1, 0, 0, 5, 1)
                )
        ));

        mockMvc.perform(get("/api/admin/test/agg-trade/raw-writer/kafka-observability/windows")
                        .param("minutes", "60")
                        .param("bucketSeconds", "60"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.minutes").value(60))
                .andExpect(jsonPath("$.bucketSeconds").value(60))
                .andExpect(jsonPath("$.windows[0].consumedRecords").value(100))
                .andExpect(jsonPath("$.windows[0].dlqPublishedRecords").value(1));
    }
}
