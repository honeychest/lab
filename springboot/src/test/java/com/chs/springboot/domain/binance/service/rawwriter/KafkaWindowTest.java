package com.chs.springboot.domain.binance.service.rawwriter;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class KafkaWindowTest {

    @Test
    void ofAlignsEpochMsToWindowStartAndEnd() {
        KafkaWindow window = KafkaWindow.of(1778410009123L, 10_000L);

        assertThat(window.startMs()).isEqualTo(1778410000000L);
        assertThat(window.endMs()).isEqualTo(1778410010000L);
    }

    @Test
    void startOfAlignsTelemetryBucket() {
        assertThat(KafkaWindow.startOf(1778410061000L, 60_000L)).isEqualTo(1778410020000L);
    }

    @Test
    void nextKeepsSameWindowSize() {
        KafkaWindow next = new KafkaWindow(10_000L, 20_000L).next();

        assertThat(next.startMs()).isEqualTo(20_000L);
        assertThat(next.endMs()).isEqualTo(30_000L);
    }

    @Test
    void rejectsNonPositiveWindowSize() {
        assertThatThrownBy(() -> KafkaWindow.of(1000L, 0L))
                .isInstanceOf(IllegalArgumentException.class);
    }
}
