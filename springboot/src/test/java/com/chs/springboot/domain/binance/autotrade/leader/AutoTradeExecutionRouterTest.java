package com.chs.springboot.domain.binance.autotrade.leader;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class AutoTradeExecutionRouterTest {

    @Test
    void configuredLeaderExecutesOnDocker1() {
        AutoTradeExecutionRouter router = new AutoTradeExecutionRouter(
                new ConfiguredLeaderElectionStrategy("DOCKER1", "DOCKER1"));

        assertThat(router.route().kind()).isEqualTo(AutoTradeExecutionRouteKind.EXECUTE_HERE);
        assertThat(router.route().leaderName()).isEqualTo("DOCKER1");
    }

    @Test
    void otherServerForwardsToConfiguredLeader() {
        AutoTradeExecutionRouter router = new AutoTradeExecutionRouter(
                new ConfiguredLeaderElectionStrategy("DOCKER2", "DOCKER1"));

        assertThat(router.route().kind()).isEqualTo(AutoTradeExecutionRouteKind.FORWARD_TO_LEADER);
        assertThat(router.route().leaderName()).isEqualTo("DOCKER1");
    }
}
