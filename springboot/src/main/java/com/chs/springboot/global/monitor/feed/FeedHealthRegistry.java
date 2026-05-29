// [AGENT] 역할: 외부 데이터 피드의 마지막 수신시각 기록 + freshness(UP/STALE/DOWN) 판정 | 주요메서드: register, markReceived, snapshot
// Purpose: 업스트림 피드가 "연결됐나"가 아니라 "데이터가 실제로 들어오고 있나"를 마지막 수신시각 기준으로 판정한다.
package com.chs.springboot.global.monitor.feed;

import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.LongAdder;

public class FeedHealthRegistry {

    private final Clock clock;
    private final Map<String, FeedThreshold> thresholds = new ConcurrentHashMap<>();
    private final Map<String, Instant> lastReceived = new ConcurrentHashMap<>();
    private final Map<String, LongAdder> receivedCounts = new ConcurrentHashMap<>();

    public FeedHealthRegistry(Clock clock) {
        this.clock = clock;
    }

    public void register(String feedId, FeedThreshold threshold) {
        thresholds.put(feedId, threshold);
        receivedCounts.computeIfAbsent(feedId, k -> new LongAdder());
    }

    public void markReceived(String feedId) {
        lastReceived.put(feedId, clock.instant());
        receivedCounts.computeIfAbsent(feedId, k -> new LongAdder()).increment();
    }

    public List<FeedHealth> snapshot() {
        List<FeedHealth> out = new ArrayList<>(thresholds.size());
        for (Map.Entry<String, FeedThreshold> entry : thresholds.entrySet()) {
            String feedId = entry.getKey();
            FeedThreshold threshold = entry.getValue();
            Instant last = lastReceived.get(feedId);
            LongAdder counter = receivedCounts.get(feedId);
            long count = counter == null ? 0L : counter.sum();
            if (last == null) {
                out.add(new FeedHealth(feedId, FeedStatus.DOWN, null, null, count));
                continue;
            }
            long elapsed = clock.instant().getEpochSecond() - last.getEpochSecond();
            out.add(new FeedHealth(feedId, judge(elapsed, threshold), elapsed, last.toEpochMilli(), count));
        }
        return out;
    }

    private static FeedStatus judge(long elapsedSeconds, FeedThreshold threshold) {
        if (elapsedSeconds >= threshold.downSeconds()) {
            return FeedStatus.DOWN;
        }
        if (elapsedSeconds >= threshold.staleSeconds()) {
            return FeedStatus.STALE;
        }
        return FeedStatus.UP;
    }

    public record FeedThreshold(long staleSeconds, long downSeconds) { }

    public record FeedHealth(String feedId, FeedStatus status, Long secondsSinceLastMessage,
                             Long lastMessageAtEpochMs, long receivedCount) { }
}
