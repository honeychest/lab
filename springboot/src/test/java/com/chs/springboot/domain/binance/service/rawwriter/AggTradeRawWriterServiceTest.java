package com.chs.springboot.domain.binance.service.rawwriter;

import com.chs.springboot.domain.binance.repository.AggTradeCollectStatusRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.jdbc.core.JdbcTemplate;

import java.sql.PreparedStatement;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class AggTradeRawWriterServiceTest {

    private final JdbcTemplate jdbcTemplate = mock(JdbcTemplate.class);
    private final StringRedisTemplate redisTemplate = mock(StringRedisTemplate.class);
    private final AggTradeCollectStatusRepository statusRepository = mock(AggTradeCollectStatusRepository.class);
    private final AggTradeRawWriterDryRunVerifier dryRunVerifier = new AggTradeRawWriterDryRunVerifier(jdbcTemplate, true, true);
    private final AggTradeRawWriterService service = new AggTradeRawWriterService(
            jdbcTemplate,
            redisTemplate,
            statusRepository,
            new ObjectMapper(),
            dryRunVerifier,
            true,
            "dry-run"
    );

    @Test
    void dryRunRecordsInsertCandidateSummaryWithoutWritingDbOrCheckpoint() {
        when(jdbcTemplate.queryForObject(
                org.mockito.ArgumentMatchers.anyString(),
                org.mockito.ArgumentMatchers.any(org.springframework.jdbc.core.RowMapper.class),
                org.mockito.ArgumentMatchers.any(),
                org.mockito.ArgumentMatchers.any(),
                org.mockito.ArgumentMatchers.any(),
                org.mockito.ArgumentMatchers.any()
        )).thenReturn(AggTradeRawWriterDbWindowStats.empty());

        service.writeBatch(List.of(new AggTradeRawWriterMessage(
                "market.aggtrade.raw",
                2,
                15L,
                "BTCUSDT|FUTURES",
                """
                        {
                          "symbol": "BTCUSDT",
                          "marketType": "FUTURES",
                          "payload": {
                            "e": "aggTrade",
                            "a": 123,
                            "p": "100.0",
                            "q": "0.01",
                            "f": 1,
                            "l": 2,
                            "T": 1778410000000,
                            "m": false
                          },
                          "receivedAt": 1778410000123
                        }
                        """
        )));

        AggTradeRawWriterSummaryResponse snapshot = dryRunVerifier.snapshot();
        assertThat(snapshot.summaries()).isEmpty();

        verify(jdbcTemplate, never()).batchUpdate(org.mockito.ArgumentMatchers.anyString(), org.mockito.ArgumentMatchers.any(org.springframework.jdbc.core.BatchPreparedStatementSetter.class));
        verify(redisTemplate, never()).opsForValue();
        verify(statusRepository, never()).save(org.mockito.ArgumentMatchers.any());
    }

    @Test
    void writeModeUsesInsertIgnoreBatchSqlAndPreparedStatementBindings() throws Exception {
        AggTradeRawWriterDryRunVerifier writeSummaryStore = new AggTradeRawWriterDryRunVerifier(jdbcTemplate, true, false);
        AggTradeRawWriterService writeService = new AggTradeRawWriterService(
                jdbcTemplate,
                redisTemplate,
                statusRepository,
                new ObjectMapper(),
                writeSummaryStore,
                false,
                "live"
        );
        org.mockito.ArgumentCaptor<org.springframework.jdbc.core.BatchPreparedStatementSetter> setterCaptor =
                org.mockito.ArgumentCaptor.forClass(org.springframework.jdbc.core.BatchPreparedStatementSetter.class);
        when(statusRepository.findBySymbolAndMarketType("BTCUSDT", "FUTURES")).thenReturn(Optional.empty());
        org.springframework.data.redis.core.ValueOperations<String, String> valueOps = mock(org.springframework.data.redis.core.ValueOperations.class);
        when(redisTemplate.opsForValue()).thenReturn(valueOps);

        writeService.writeBatch(List.of(validMessage()));

        org.mockito.ArgumentCaptor<String> sqlCaptor = org.mockito.ArgumentCaptor.forClass(String.class);
        verify(jdbcTemplate).batchUpdate(sqlCaptor.capture(), setterCaptor.capture());
        assertThat(sqlCaptor.getValue()).contains("INSERT IGNORE INTO raw_agg_trade");
        assertThat(setterCaptor.getValue().getBatchSize()).isEqualTo(1);

        PreparedStatement ps = mock(PreparedStatement.class);
        setterCaptor.getValue().setValues(ps, 0);
        verify(ps).setString(1, "BTCUSDT");
        verify(ps).setString(2, "FUTURES");
        verify(ps).setLong(3, 123L);
        verify(ps).setBigDecimal(4, new java.math.BigDecimal("100.0"));
        verify(ps).setBigDecimal(5, new java.math.BigDecimal("0.01"));
        verify(ps).setLong(6, 1L);
        verify(ps).setLong(7, 2L);
        verify(ps).setBoolean(8, false);
        verify(ps).setLong(9, 1778410000000L);
        verify(valueOps).set("aggtrade:checkpoint:BTCUSDT:FUTURES", "123");
        verify(statusRepository).save(any());
    }

    @Test
    void shadowModeWritesToShadowTableWithoutCheckpointSideEffects() {
        AggTradeRawWriterDryRunVerifier writeSummaryStore = new AggTradeRawWriterDryRunVerifier(jdbcTemplate, true, false);
        AggTradeRawWriterService writeService = new AggTradeRawWriterService(
                jdbcTemplate,
                redisTemplate,
                statusRepository,
                new ObjectMapper(),
                writeSummaryStore,
                false,
                "shadow"
        );

        writeService.writeBatch(List.of(validMessage()));

        org.mockito.ArgumentCaptor<String> sqlCaptor = org.mockito.ArgumentCaptor.forClass(String.class);
        verify(jdbcTemplate).batchUpdate(sqlCaptor.capture(), org.mockito.ArgumentMatchers.any(org.springframework.jdbc.core.BatchPreparedStatementSetter.class));
        assertThat(sqlCaptor.getValue()).contains("INSERT IGNORE INTO raw_agg_trade_test");
        verify(redisTemplate, never()).opsForValue();
        verify(statusRepository, never()).save(any());
    }

    @Test
    void rejectsUnsupportedWriteMode() {
        assertThatThrownBy(() -> new AggTradeRawWriterService(
                jdbcTemplate,
                redisTemplate,
                statusRepository,
                new ObjectMapper(),
                dryRunVerifier,
                false,
                "raw_agg_trade_test"
        )).isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("Unsupported raw-writer write mode");
    }

    private AggTradeRawWriterMessage validMessage() {
        return new AggTradeRawWriterMessage(
                "market.aggtrade.raw",
                2,
                15L,
                "BTCUSDT|FUTURES",
                """
                        {
                          "symbol": "BTCUSDT",
                          "marketType": "FUTURES",
                          "payload": {
                            "e": "aggTrade",
                            "a": 123,
                            "p": "100.0",
                            "q": "0.01",
                            "f": 1,
                            "l": 2,
                            "T": 1778410000000,
                            "m": false
                          },
                          "receivedAt": 1778410000123
                        }
                        """
        );
    }
}
