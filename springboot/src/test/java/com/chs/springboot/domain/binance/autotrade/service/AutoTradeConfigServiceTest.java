package com.chs.springboot.domain.binance.autotrade.service;

import com.chs.springboot.domain.binance.autotrade.model.AutoTradeStrategyConfig;
import com.chs.springboot.global.config.service.AppConfigService;
import org.junit.jupiter.api.Test;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class AutoTradeConfigServiceTest {

    private final AppConfigService appConfigService = mock(AppConfigService.class);
    private final AutoTradeConfigService configService = new AutoTradeConfigService(appConfigService);

    @Test
    void usesTheApprovedTestProfileWhenNoStoredValueExists() {
        when(appConfigService.get(anyString())).thenReturn(null);

        AutoTradeStrategyConfig config = configService.current();

        assertThat(config.symbol()).isEqualTo("ENAUSDT");
        assertThat(config.baseNotional()).isEqualByComparingTo("5");
        assertThat(config.addStepPct()).isEqualByComparingTo("0.01");
        assertThat(config.takeProfitPct()).isEqualByComparingTo("0.02");
        assertThat(config.stopLossPct()).isEqualByComparingTo("0.02");
        assertThat(config.martingaleRatio()).isEqualByComparingTo("2");
        assertThat(config.maxAdds()).isEqualTo(3);
    }

    @Test
    void validatesAllUpdatesBeforePersistingAnyValue() {
        when(appConfigService.get(anyString())).thenReturn(null);

        assertThatThrownBy(() -> configService.update(Map.of("max-adds", "-1", "base-notional", "10")))
                .isInstanceOf(IllegalArgumentException.class);

        verify(appConfigService, org.mockito.Mockito.never()).set(anyString(), anyString());
    }

    @Test
    void persistsValidatedUpdates() {
        when(appConfigService.get(anyString())).thenReturn(null);

        configService.update(Map.of("base-notional", "10", "max-adds", "2"));

        verify(appConfigService).set("config:binance:autotrade:base-notional", "10");
        verify(appConfigService).set("config:binance:autotrade:max-adds", "2");
    }
}
