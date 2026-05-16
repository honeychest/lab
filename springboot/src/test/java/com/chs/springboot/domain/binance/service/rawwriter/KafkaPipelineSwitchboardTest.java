package com.chs.springboot.domain.binance.service.rawwriter;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class KafkaPipelineSwitchboardTest {

    @Test
    void forceOffFlagForcesRawWriterOff() {
        KafkaPipelineExecutionPlan plan = new KafkaPipelineSwitchboard(true).aggTradeRawWriterPlan();

        assertThat(plan.mode()).isEqualTo("off");
        assertThat(plan.enabled()).isFalse();
        assertThat(plan.targetTable()).isNull();
    }

    @Test
    void defaultUsesSourceOwnedState() {
        KafkaPipelineExecutionPlan plan = new KafkaPipelineSwitchboard(false).aggTradeRawWriterPlan();

        assertThat(plan.mode()).isEqualTo("live");
        assertThat(plan.enabled()).isTrue();
        assertThat(plan.targetTable()).isEqualTo("raw_agg_trade");
    }
}
