// [AGENT] 역할: 데이터 누락 구간 조회 어드민 API | 연관파일: DataGapAdminService.java
// 엔드포인트: GET /api/admin/data-gap/access (IP 접근 체크), GET /api/admin/data-gap/check?type=xxx (누락 조회)
// IP 인증: binance.threshold.allowed-ips 재사용 — 불일치 시 403
package com.chs.springboot.domain.binance.controller;

import com.chs.springboot.domain.binance.service.DataGapAdminService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/admin/data-gap")
public class DataGapAdminController {

    private static final Logger log = LoggerFactory.getLogger(DataGapAdminController.class);

    private final DataGapAdminService service;

    @Value("${binance.threshold.allowed-ips:}")
    private String allowedIps;

    public DataGapAdminController(DataGapAdminService service) {
        this.service = service;
    }

    /** X-Forwarded-For → RemoteAddr 순으로 클라이언트 IP 추출. IPv6 루프백은 127.0.0.1로 정규화 */
    private static String getClientIp(HttpServletRequest request) {
        String xff = request.getHeader("X-Forwarded-For");
        String ip = (xff != null && !xff.isBlank()) ? xff.split(",")[0].trim() : request.getRemoteAddr();
        // IPv6 루프백(::1 / 0:0:0:0:0:0:0:1) → 127.0.0.1 정규화
        if ("0:0:0:0:0:0:0:1".equals(ip) || "::1".equals(ip)) {
            return "127.0.0.1";
        }
        return ip;
    }

    /** 허용 IP 목록에 포함된 요청인지 확인. 127.0.0.1(로컬)은 항상 허용 */
    private boolean isAllowed(HttpServletRequest request) {
        String clientIp = getClientIp(request);
        if (allowedIps == null || allowedIps.isBlank()) {
            log.info("[AdminAccess] allowedIps 미설정 → 전체 허용. clientIp={}", clientIp);
            return true;
        }
        Set<String> allowed = Arrays.stream(allowedIps.split(","))
                .map(String::trim)
                .filter(s -> !s.isEmpty())
                .collect(Collectors.toSet());
        allowed.add("127.0.0.1"); // 로컬 개발 환경 항상 허용
        boolean ok = allowed.contains(clientIp);
        log.info("[AdminAccess] clientIp={} | allowedIps={} | result={}", clientIp, allowedIps, ok ? "허용" : "차단");
        return ok;
    }

    /** IP 접근 권한 체크 — 프론트가 탭 표시 여부 판단에 사용 */
    @GetMapping("/access")
    public ResponseEntity<Map<String, Boolean>> checkAccess(HttpServletRequest request) {
        return ResponseEntity.ok(Map.of("canAccess", isAllowed(request)));
    }

    /** 누락 구간 조회 — type: RAW_AGG_TRADE | AGG_1M | AGG_5M | FORCE_ORDER | OI, days: 생략 시 전체 */
    @GetMapping("/check")
    public ResponseEntity<?> check(
            @RequestParam String type,
            @RequestParam(required = false) Integer days,
            HttpServletRequest request) {
        if (!isAllowed(request)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(Map.of("error", "접근 권한이 없습니다."));
        }
        try {
            List<Map<String, Object>> result = service.checkGap(type, days);
            return ResponseEntity.ok(result);
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }
}
