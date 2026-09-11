package com.chs.springboot.domain.binance.autotrade.service;

import com.chs.springboot.global.config.service.AppConfigService;
import org.junit.jupiter.api.Test;

import java.util.Map;
import java.util.HashMap;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class AutoTradeExecutionSettingsServiceTest {

    @Test
    void defaultsToOffAndSupportsDynamicUpdates() {
        AppConfigService appConfigService = mock(AppConfigService.class);
        Map<String, String> stored = new HashMap<>();
        when(appConfigService.get(org.mockito.ArgumentMatchers.anyString()))
                .thenAnswer(invocation -> stored.get(invocation.getArgument(0)));
        org.mockito.Mockito.doAnswer(invocation -> {
            stored.put(invocation.getArgument(0), invocation.getArgument(1));
            return null;
        }).when(appConfigService).set(org.mockito.ArgumentMatchers.anyString(), org.mockito.ArgumentMatchers.anyString());
        AutoTradeExecutionSettingsService service = new AutoTradeExecutionSettingsService(appConfigService);

        assertThat(service.current().mode().name()).isEqualTo("OFF");
        assertThat(service.current().policy().name()).isEqualTo("MANUAL");

        service.update(Map.of(
                "mode", "PAPER",
                "policy", "AUTO",
                "order-cooldown-ms", "0"));

        assertThat(service.current().mode().name()).isEqualTo("PAPER");
        assertThat(service.current().policy().name()).isEqualTo("AUTO");
        assertThat(service.current().orderCooldownMs()).isZero();
    }
}
