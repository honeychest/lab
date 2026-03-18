// [AGENT] 5초 주기 메트릭 수집 + /ws/monitor 브로드캐스트 + AlertService 평가
package com.chs.springboot.global.monitor.service;

import com.chs.springboot.domain.binance.websocket.BinancePriceWebSocketHandler;
import com.chs.springboot.global.monitor.dto.MetricSnapshot;
import com.chs.springboot.global.monitor.handler.MonitorWebSocketHandler;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.micrometer.core.instrument.Meter;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Tag;
import io.micrometer.core.instrument.Gauge;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.io.File;
import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.util.*;
import java.util.concurrent.TimeUnit;

@Slf4j
@Service
@RequiredArgsConstructor
public class MetricCollectorService {

    private final StringRedisTemplate redisTemplate;
    private final MeterRegistry meterRegistry;
    private final MonitorWebSocketHandler monitorWebSocketHandler;
    private final AlertService alertService;
    private final BinancePriceWebSocketHandler binancePriceWebSocketHandler;

    private final ObjectMapper objectMapper = new ObjectMapper();
    private final String containerId = Optional.ofNullable(System.getenv("HOSTNAME"))
            .filter(s -> !s.isBlank())
            .orElseGet(() -> UUID.randomUUID().toString().substring(0, 8));

    private volatile double prev5xxCount = 0d;
    private volatile double prevTotalCount = 0d;

    @Scheduled(fixedDelay = 5000)
    public void collect() {
        if (!isLeader()) {
            return;
        }

        Double cpu = safe(this::collectCpuPercent);
        Double ram = safe(this::collectRamPercent);
        Double disk = safe(this::collectDiskPercent);
        Double apiErrorRate = safe(this::collectApiErrorRatePercent);

        Long redisQueue = safe(() -> redisTemplate.opsForList().size("rawAggTrade"));
        Integer wsConnections = safe(binancePriceWebSocketHandler::getSessionCount);

        List<MetricSnapshot.ContainerInfo> containers = safe(this::collectContainers);
        if (containers == null) containers = List.of();

        MetricSnapshot snapshot = new MetricSnapshot(
                cpu,
                ram,
                disk,
                redisQueue,
                wsConnections,
                apiErrorRate,
                containers,
                LocalDateTime.now(),
                containerId
        );

        monitorWebSocketHandler.broadcast(snapshot);
        alertService.evaluate(snapshot);
    }

    private boolean isLeader() {
        try {
            Boolean ok = redisTemplate.opsForValue()
                    .setIfAbsent("monitor:leader", containerId, 10, TimeUnit.SECONDS);
            return Boolean.TRUE.equals(ok);
        } catch (Exception e) {
            // 리더 선출 실패(예: Redis 장애) 시 수집 중단 — 이중 수집/알림을 피하기 위함
            log.warn("[MetricCollector] leader election failed: {}", e.getMessage());
            return false;
        }
    }

    private Double collectCpuPercent() {
        Gauge g = meterRegistry.find("system.cpu.usage").gauge();
        if (g == null) return null;
        double v = g.value() * 100d;
        return clampPercent(v);
    }

    private Double collectRamPercent() {
        double used = 0d;
        double max = 0d;

        for (Gauge g : meterRegistry.find("jvm.memory.used").tag("area", "heap").gauges()) {
            used += g.value();
        }
        for (Gauge g : meterRegistry.find("jvm.memory.max").tag("area", "heap").gauges()) {
            max += g.value();
        }
        if (max <= 0) return null;
        return clampPercent((used / max) * 100d);
    }

    private Double collectDiskPercent() {
        File root = new File("/");
        long total = root.getTotalSpace();
        long free = root.getFreeSpace();
        if (total <= 0) return null;
        double usedPercent = ((double) (total - free) / (double) total) * 100d;
        return clampPercent(usedPercent);
    }

    private Double collectApiErrorRatePercent() {
        double total = 0d;
        double five = 0d;

        Collection<Meter> meters = meterRegistry.find("http.server.requests").meters();
        for (Meter m : meters) {
            double count = 0d;
            for (io.micrometer.core.instrument.Measurement ms : m.measure()) {
                if ("COUNT".equalsIgnoreCase(ms.getStatistic().name())) {
                    count += ms.getValue();
                }
            }

            total += count;

            String status = tagValue(m.getId().getTags(), "status");
            if (status != null && status.startsWith("5")) {
                five += count;
            }
        }

        double totalDelta = Math.max(0d, total - prevTotalCount);
        double fiveDelta = Math.max(0d, five - prev5xxCount);

        prevTotalCount = total;
        prev5xxCount = five;

        if (totalDelta <= 0d) return 0d;
        return clampPercent((fiveDelta / totalDelta) * 100d);
    }

    private List<MetricSnapshot.ContainerInfo> collectContainers() throws Exception {
        String ids = execAndRead("docker", "ps", "-aq").trim();
        if (ids.isBlank()) return List.of();

        List<String> cmd = new ArrayList<>();
        cmd.add("docker");
        cmd.add("inspect");
        cmd.addAll(Arrays.asList(ids.split("\\R+")));

        String json = execAndRead(cmd.toArray(new String[0]));
        JsonNode root = objectMapper.readTree(json);
        if (!root.isArray()) return List.of();

        List<MetricSnapshot.ContainerInfo> list = new ArrayList<>();
        for (JsonNode node : root) {
            String name = node.path("Name").asText("");
            if (name.startsWith("/")) name = name.substring(1);
            String status = node.path("State").path("Status").asText("");
            int restarts = node.path("RestartCount").asInt(0);
            if (!name.isBlank()) {
                list.add(new MetricSnapshot.ContainerInfo(name, status, restarts));
            }
        }
        return list;
    }

    private static String tagValue(List<Tag> tags, String key) {
        for (Tag t : tags) {
            if (key.equals(t.getKey())) return t.getValue();
        }
        return null;
    }

    private String execAndRead(String... command) throws Exception {
        Process p = new ProcessBuilder(command)
                .redirectErrorStream(true)
                .start();

        boolean finished = p.waitFor(5, TimeUnit.SECONDS);
        if (!finished) {
            p.destroyForcibly();
            throw new RuntimeException("command timeout: " + String.join(" ", command));
        }

        byte[] bytes = p.getInputStream().readAllBytes();
        String out = new String(bytes, StandardCharsets.UTF_8);
        if (p.exitValue() != 0) {
            throw new RuntimeException("command failed: " + String.join(" ", command) + " | " + out);
        }
        return out;
    }

    private static Double clampPercent(Double v) {
        if (v == null) return null;
        if (v.isNaN() || v.isInfinite()) return null;
        return Math.max(0d, Math.min(100d, v));
    }

    private static <T> T safe(SupplierWithException<T> supplier) {
        try {
            return supplier.get();
        } catch (Exception e) {
            return null;
        }
    }

    @FunctionalInterface
    private interface SupplierWithException<T> {
        T get() throws Exception;
    }
}

