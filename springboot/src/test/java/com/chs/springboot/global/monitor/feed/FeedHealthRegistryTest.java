package com.chs.springboot.global.monitor.feed;

import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class FeedHealthRegistryTest {

    private final MutableClock clock = new MutableClock(Instant.parse("2026-05-29T00:00:00Z"));

    @Test
    void receivedJustNow_isUp() {
        FeedHealthRegistry registry = new FeedHealthRegistry(clock);
        registry.register("binance-ticker", new FeedHealthRegistry.FeedThreshold(10, 30));

        registry.markReceived("binance-ticker");

        List<FeedHealthRegistry.FeedHealth> snapshot = registry.snapshot();
        assertThat(snapshot).hasSize(1);
        assertThat(snapshot.get(0).feedId()).isEqualTo("binance-ticker");
        assertThat(snapshot.get(0).status()).isEqualTo(FeedStatus.UP);
        assertThat(snapshot.get(0).secondsSinceLastMessage()).isEqualTo(0L);
    }

    @Test
    void elapsedCrossesThresholds_upThenStaleThenDown() {
        FeedHealthRegistry registry = new FeedHealthRegistry(clock);
        registry.register("binance-ticker", new FeedHealthRegistry.FeedThreshold(10, 30));
        Instant base = clock.instant();
        registry.markReceived("binance-ticker");

        clock.setInstant(base.plusSeconds(9));
        assertThat(statusOf(registry, "binance-ticker")).isEqualTo(FeedStatus.UP);

        clock.setInstant(base.plusSeconds(10));
        assertThat(statusOf(registry, "binance-ticker")).isEqualTo(FeedStatus.STALE);

        clock.setInstant(base.plusSeconds(29));
        assertThat(statusOf(registry, "binance-ticker")).isEqualTo(FeedStatus.STALE);

        clock.setInstant(base.plusSeconds(30));
        assertThat(statusOf(registry, "binance-ticker")).isEqualTo(FeedStatus.DOWN);
    }

    @Test
    void neverReceived_isDown() {
        FeedHealthRegistry registry = new FeedHealthRegistry(clock);
        registry.register("upbit", new FeedHealthRegistry.FeedThreshold(10, 30));

        FeedHealthRegistry.FeedHealth health = registry.snapshot().get(0);
        assertThat(health.status()).isEqualTo(FeedStatus.DOWN);
        assertThat(health.secondsSinceLastMessage()).isNull();
    }

    private static FeedStatus statusOf(FeedHealthRegistry registry, String feedId) {
        return registry.snapshot().stream()
                .filter(h -> h.feedId().equals(feedId))
                .findFirst()
                .orElseThrow()
                .status();
    }

    private static final class MutableClock extends Clock {
        private Instant instant;

        private MutableClock(Instant instant) {
            this.instant = instant;
        }

        private void setInstant(Instant instant) {
            this.instant = instant;
        }

        @Override
        public ZoneId getZone() {
            return ZoneId.of("UTC");
        }

        @Override
        public Clock withZone(ZoneId zone) {
            return this;
        }

        @Override
        public Instant instant() {
            return instant;
        }
    }
}
