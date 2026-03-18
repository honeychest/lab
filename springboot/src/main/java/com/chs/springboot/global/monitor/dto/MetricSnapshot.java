// [AGENT] /ws/monitor 브로드캐스트용 스냅샷 DTO (T3 계약 준수)
package com.chs.springboot.global.monitor.dto;

import java.time.LocalDateTime;
import java.util.List;

public record MetricSnapshot(
        Double cpu,
        Double ram,
        Double disk,
        Long redisQueue,
        Integer wsConnections,
        Double apiErrorRate,
        List<ContainerInfo> containers,
        LocalDateTime collectedAt,
        String containerId
) {
    public record ContainerInfo(
            String name,
            String status,
            Integer restarts
    ) {
    }
}

