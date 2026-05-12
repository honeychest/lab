package com.chs.springboot.domain.binance.service.rawwriter;

import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class AggTradeRawWriterSummaryStoreTest {

    private final JdbcTemplate jdbcTemplate = mock(JdbcTemplate.class);
    private final AggTradeRawWriterSummaryStore store = new AggTradeRawWriterSummaryStore(
            jdbcTemplate,
            true,
            true,
            1778410004000L
    );

    @Test
    void finalizesClosedWindowAndComparesKafkaAggregateWithDbWindow() {
        when(jdbcTemplate.queryForObject(anyString(), any(org.springframework.jdbc.core.RowMapper.class),
                any(), any(), any(), any()))
                .thenReturn(new AggTradeRawWriterDbWindowStats(2, 100L, 101L, 1778410001000L, 1778410009000L));

        store.accumulate(new AggTradeRawWriterKafkaWindowEvent(
                "BTCUSDT",
                "SPOT",
                1778410001000L,
                100L,
                0
        ));
        store.accumulate(new AggTradeRawWriterKafkaWindowEvent(
                "BTCUSDT",
                "SPOT",
                1778410009000L,
                101L,
                0
        ));

        store.finalizeWindowsBefore(1778410014000L);
        assertThat(store.snapshot().summaries()).isEmpty();

        store.finalizeWindowsBefore(1778410015000L);

        AggTradeRawWriterSummaryResponse snapshot = store.snapshot();
        assertThat(snapshot.summaries()).hasSize(1);
        AggTradeRawWriterDryRunSummary summary = snapshot.summaries().get(0);
        assertThat(summary.windowStartMs()).isEqualTo(1778410000000L);
        assertThat(summary.windowEndMs()).isEqualTo(1778410010000L);
        assertThat(summary.kafkaCount()).isEqualTo(2);
        assertThat(summary.dbCount()).isEqualTo(2);
        assertThat(summary.kafkaMinAggTradeId()).isEqualTo(100L);
        assertThat(summary.kafkaMaxAggTradeId()).isEqualTo(101L);
        assertThat(summary.partialWindow()).isTrue();
        assertThat(summary.comparisonStatus()).isEqualTo("PARTIAL");
    }
}
