package com.chs.springboot.domain.binance.service;

import com.chs.springboot.domain.binance.model.AggTradeCollectStatus;
import com.chs.springboot.domain.binance.repository.AggTradeCollectStatusRepository;
import com.chs.springboot.global.redis.LeaderElectionService;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.jdbc.core.JdbcTemplate;

import java.time.LocalDateTime;
import java.util.Optional;

import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

class AggTradeBackfillServiceTest {

    @Test
    @DisplayName("executeBackfill은 BTCUSDT FUTURES도 백필 대상으로 조회한다")
    void executeBackfill_includesBtcUsdtFuturesTarget() {
        StringRedisTemplate redisTemplate = mock(StringRedisTemplate.class);
        AggTradeConfigService configService = mock(AggTradeConfigService.class);
        LeaderElectionService leaderElectionService = mock(LeaderElectionService.class);
        AggTradeCollectStatusRepository statusRepository = mock(AggTradeCollectStatusRepository.class);
        JdbcTemplate batchJdbcTemplate = mock(JdbcTemplate.class);

        AggTradeBackfillService service = new AggTradeBackfillService(
                redisTemplate,
                configService,
                leaderElectionService,
                statusRepository,
                batchJdbcTemplate
        );

        AggTradeCollectStatus deferred = deferredStatus();
        when(statusRepository.findBySymbolAndMarketType(anyString(), anyString()))
                .thenReturn(Optional.of(deferred));

        ReflectionTestUtils.invokeMethod(service, "executeBackfill");

        verify(statusRepository).findBySymbolAndMarketType(eq("BTCUSDT"), eq("FUTURES"));
    }

    private AggTradeCollectStatus deferredStatus() {
        AggTradeCollectStatus status = new AggTradeCollectStatus();
        status.setEnabled(Boolean.TRUE);
        status.setNextBackfillAt(LocalDateTime.now().plusMinutes(5));
        return status;
    }
}
