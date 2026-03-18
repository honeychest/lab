// [AGENT] 임계 지속 초과 알림 + 쿨다운 + AlertHistory 저장
package com.chs.springboot.global.monitor.service;

import com.chs.springboot.global.monitor.dto.MetricSnapshot;
import com.chs.springboot.global.monitor.entity.AlertHistory;
import com.chs.springboot.global.monitor.repository.AlertHistoryRepository;
import com.chs.springboot.global.telegram.TelegramProvider;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

@Slf4j
@Service
@RequiredArgsConstructor
public class AlertService {

    private final StringRedisTemplate redisTemplate;
    private final TelegramProvider telegramProvider;
    private final AlertHistoryRepository alertHistoryRepository;

    private final ConcurrentHashMap<String, AtomicInteger> durationCounters = new ConcurrentHashMap<>();

    public void evaluate(MetricSnapshot snapshot) {
        if (snapshot == null) return;

        if (isSilenced()) {
            return;
        }

        // 1차 MVP: CRITICAL만 (CPU/RAM/DISK 100% 이상 1분 지속 시)
        evaluateCritical(AlertHistory.MetricType.CPU, snapshot.cpu(), 100d, snapshot.containerId());
        evaluateCritical(AlertHistory.MetricType.RAM, snapshot.ram(), 100d, snapshot.containerId());
        evaluateCritical(AlertHistory.MetricType.DISK, snapshot.disk(), 100d, snapshot.containerId());
    }

    private void evaluateCritical(AlertHistory.MetricType type, Double value, double threshold, String containerId) {
        if (value == null) {
            durationCounters.computeIfAbsent(type.name(), k -> new AtomicInteger(0)).set(0);
            return;
        }

        int durationCycles = 12; // 5초 * 12 = 60초
        int cooldownSec = 3600;

        AtomicInteger counter = durationCounters.computeIfAbsent(type.name(), k -> new AtomicInteger(0));
        if (value >= threshold) {
            int c = counter.incrementAndGet();
            if (c < durationCycles) {
                return;
            }

            String cooldownKey = "monitor:alert:cooldown:" + type.name();
            String already = redisTemplate.opsForValue().get(cooldownKey);
            if (already != null) {
                return;
            }

            sendAndStore(type, value, threshold, durationCycles * 5, cooldownKey, cooldownSec, containerId);
        } else {
            counter.set(0);
        }
    }

    private boolean isSilenced() {
        try {
            String v = redisTemplate.opsForValue().get("monitor:silence");
            return "ON".equalsIgnoreCase(v);
        } catch (Exception e) {
            return false;
        }
    }

    private void sendAndStore(
            AlertHistory.MetricType type,
            double value,
            double threshold,
            int durationSec,
            String cooldownKey,
            int cooldownSec,
            String containerId
    ) {
        try {
            String titleMetric = switch (type) {
                case CPU -> "CPU";
                case RAM -> "RAM";
                case DISK -> "DISK";
                case REDIS_QUEUE -> "Redis 큐";
                case API_ERROR -> "API 에러율";
            };

            String sentAt = LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));
            String msg = """
                    🔴 [긴급] %s 과부하
                    현재값: %.1f%% / 임계값: %.1f%%
                    지속시간: %d분
                    발생: %s
                    서버: %s
                    """.formatted(titleMetric, value, threshold, Math.max(1, durationSec / 60), sentAt, containerId != null ? containerId : "UNKNOWN")
                    .trim();

            telegramProvider.sendMessage(msg);

            redisTemplate.opsForValue().set(cooldownKey, "1", cooldownSec, TimeUnit.SECONDS);

            AlertHistory h = new AlertHistory();
            h.setMetricType(type);
            h.setValue(value);
            h.setThreshold(threshold);
            h.setDurationSec(durationSec);
            h.setSeverity(AlertHistory.Severity.CRITICAL);
            h.setSentAt(LocalDateTime.now());
            alertHistoryRepository.save(h);
        } catch (Exception e) {
            log.warn("AlertService send/store failed: {}", e.getMessage());
        }
    }
}

