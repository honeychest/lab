package com.chs.springboot.domain.binance.autotrade.config;

import com.chs.springboot.domain.binance.autotrade.leader.ConfiguredLeaderElectionStrategy;
import com.chs.springboot.domain.binance.autotrade.leader.LeaderElectionStrategy;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class AutoTradeExecutionConfiguration {

    @Bean
    public LeaderElectionStrategy autoTradeLeaderElectionStrategy(
            @Value("${SERVER_NAME:LOCAL}") String serverName,
            @Value("${binance.autotrade.execution-leader:${SERVER_NAME:LOCAL}}") String configuredLeader) {
        return new ConfiguredLeaderElectionStrategy(serverName, configuredLeader);
    }
}
