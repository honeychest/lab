// [AGENT] 모니터링 관련 REST API (access-request, allowed-ips, alert-history, ping)
package com.chs.springboot.global.monitor.controller;

import com.chs.springboot.global.monitor.entity.AlertHistory;
import com.chs.springboot.global.monitor.entity.IpAuditLog;
import com.chs.springboot.global.monitor.repository.AlertHistoryRepository;
import com.chs.springboot.global.monitor.service.IpAuditLogService;
import com.chs.springboot.global.telegram.TelegramProvider;
import lombok.RequiredArgsConstructor;
import org.springframework.data.redis.core.Cursor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.ScanOptions;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import jakarta.servlet.http.HttpServletRequest;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.*;
import java.util.concurrent.TimeUnit;

@RestController
@RequestMapping("/api")
@RequiredArgsConstructor
public class MonitorApiController {

    private final StringRedisTemplate redisTemplate;
    private final TelegramProvider telegramProvider;
    private final IpAuditLogService ipAuditLogService;
    private final AlertHistoryRepository alertHistoryRepository;

    /**
     * 접근 요청 (공개 엔드포인트)
     * - 동일 IP가 pending이면 텔레그램 재발송 없이 already_pending
     */
    @PostMapping("/monitor/access-request")
    public ResponseEntity<Map<String, String>> requestAccess(HttpServletRequest request) {
        String clientIp = extractClientIp(request);

        String ipPendingKey = "monitor:ip-pending:" + clientIp;
        String existingRequestId = redisTemplate.opsForValue().get(ipPendingKey);
        if (existingRequestId != null && !existingRequestId.isBlank()) {
            return ResponseEntity.ok(Map.of("status", "already_pending"));
        }

        String requestId = UUID.randomUUID().toString().replace("-", "").substring(0, 8);

        String pendingKey = "monitor:pending:" + requestId;
        redisTemplate.opsForValue().set(pendingKey, clientIp, 600, TimeUnit.SECONDS);
        redisTemplate.opsForValue().set(ipPendingKey, requestId, 600, TimeUnit.SECONDS);

        ipAuditLogService.record(IpAuditLog.EventType.REQUEST, clientIp, requestId);

        telegramProvider.sendMessage(buildAccessRequestMessage(clientIp, requestId));
        return ResponseEntity.ok(Map.of("status", "ok"));
    }

    /** 보호 API (Case B: /monitor는 Nginx 서빙이므로, 프론트에서 403 감지용) */
    @GetMapping("/admin/monitor/ping")
    public ResponseEntity<Map<String, String>> ping() {
        return ResponseEntity.ok(Map.of("status", "ok"));
    }

    /** 허용 IP 목록 + TTL(초) */
    @GetMapping("/admin/monitor/allowed-ips")
    public ResponseEntity<List<Map<String, Object>>> allowedIps() {
        List<Map<String, Object>> result = new ArrayList<>();

        ScanOptions options = ScanOptions.scanOptions()
                .match("monitor:allowed-ip:*")
                .count(200)
                .build();

        try (Cursor<byte[]> cursor = redisTemplate.getConnectionFactory()
                .getConnection()
                .scan(options)) {
            while (cursor.hasNext()) {
                String key = new String(cursor.next());
                String ip = key.substring("monitor:allowed-ip:".length());
                Long ttl = redisTemplate.getExpire(key, TimeUnit.SECONDS);
                result.add(Map.of(
                        "ip", ip,
                        "ttlSeconds", ttl != null ? ttl : -1
                ));
            }
        }

        // ttl 오름차순(빨리 만료) + ip 정렬
        result.sort(Comparator
                .comparingLong((Map<String, Object> m) -> ((Number) m.get("ttlSeconds")).longValue())
                .thenComparing(m -> (String) m.get("ip")));

        return ResponseEntity.ok(result);
    }

    /** 허용 IP 삭제 */
    @DeleteMapping("/admin/monitor/allowed-ips/{ip}")
    public ResponseEntity<Void> deleteAllowedIp(@PathVariable String ip) {
        redisTemplate.delete("monitor:allowed-ip:" + ip);
        return ResponseEntity.noContent().build();
    }

    /** 알림 이력 조회 (페이징 + 필터) */
    @GetMapping("/admin/monitor/alert-history")
    public ResponseEntity<Page<AlertHistory>> alertHistory(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required = false) AlertHistory.MetricType type,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size
    ) {
        LocalDateTime fromDt = from != null ? from.atStartOfDay() : null;
        LocalDateTime toDt = to != null ? to.atTime(LocalTime.MAX) : null;
        Pageable pageable = PageRequest.of(Math.max(0, page), Math.min(Math.max(1, size), 200));
        Page<AlertHistory> result = alertHistoryRepository.findByFilters(fromDt, toDt, type, pageable);
        return ResponseEntity.ok(result);
    }

    private static String extractClientIp(HttpServletRequest request) {
        String xff = request.getHeader("X-Forwarded-For");
        String ip = (xff != null && !xff.isBlank()) ? xff.split(",")[0].trim() : request.getRemoteAddr();
        if ("0:0:0:0:0:0:0:1".equals(ip) || "::1".equals(ip)) {
            return "127.0.0.1";
        }
        return ip;
    }

    private static String buildAccessRequestMessage(String ip, String requestId) {
        return """
                🔒 접속 권한 요청
                IP: %s
                요청ID: %s

                허용 시간을 선택해 답장하세요:
                • 수락 %s         → 1시간
                • 수락 %s 30분   → 30분
                • 수락 %s 2시간  → 2시간
                • 수락 %s 24시간 → 24시간
                """.formatted(ip, requestId, requestId, requestId, requestId, requestId).trim();
    }
}

