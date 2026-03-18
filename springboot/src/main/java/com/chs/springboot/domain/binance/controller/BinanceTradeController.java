// [AGENT] BTC 체결 API 컨트롤러 | 연관파일: BinanceTradeSseService.java, RawTickSseService.java, BinanceTradeQueryService.java
// 엔드포인트: GET /api/binance/trades/sse, GET /api/binance/trades/tick-sse, GET /api/binance/trades/recent, GET /api/binance/trades
package com.chs.springboot.domain.binance.controller;

import com.chs.springboot.domain.binance.service.BinanceTradeQueryService;
import com.chs.springboot.domain.binance.service.BinanceTradeSseService;
import com.chs.springboot.domain.binance.service.BinanceTradeService;
import com.chs.springboot.domain.binance.service.RawTickSseService;
import com.chs.springboot.global.feature.FeatureFlagService;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.math.BigDecimal;
import java.util.Arrays;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

@RestController
@RequestMapping("/api/binance/trades")
@RequiredArgsConstructor
public class BinanceTradeController {

    private static final Logger log = LoggerFactory.getLogger(BinanceTradeController.class);

    private final BinanceTradeSseService sseService;
    private final RawTickSseService rawTickSseService;
    private final BinanceTradeQueryService queryService;
    private final BinanceTradeService tradeService;
    private final FeatureFlagService featureFlagService;

    @Value("${binance.threshold.allowed-ips:}")
    private String thresholdAllowedIps;

    private static String getClientIp(HttpServletRequest request) {
        String xff = request.getHeader("X-Forwarded-For");
        if (xff != null && !xff.isBlank()) {
            return xff.split(",")[0].trim();
        }
        return request.getRemoteAddr();
    }

    private boolean canEditThreshold(HttpServletRequest request) {
        if (!featureFlagService.isTradeThresholdEditEnabled()) return false;
        if (thresholdAllowedIps == null || thresholdAllowedIps.isBlank()) return true;
        Set<String> allowed = Arrays.stream(thresholdAllowedIps.split(","))
                .map(String::trim)
                .filter(s -> !s.isEmpty())
                .collect(Collectors.toSet());
        return allowed.contains(getClientIp(request));
    }

    /** 큰거래 SSE 구독 */
    @GetMapping(value = "/sse", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter subscribe() {
        log.info("[TradeSse] subscribe called");
        return sseService.subscribe();
    }

    /** 실시간 틱 SSE 구독 */
    @GetMapping(value = "/tick-sse", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter subscribeTick() {
        return rawTickSseService.subscribe();
    }

    /** 최신 N건 (id DESC). before 파라미터 있으면 before-id 기반 추가 로드 */
    @GetMapping("/recent")
    public ResponseEntity<?> getRecent(
            @RequestParam(defaultValue = "100") int limit,
            @RequestParam(required = false) Long before) {
        if (before != null) {
            return ResponseEntity.ok(queryService.getRecentBefore(before, limit));
        }
        return ResponseEntity.ok(queryService.getRecent(limit));
    }

    /** 현재 threshold 조회 (canEdit: 허용 IP에서만 true) */
    @GetMapping("/threshold")
    public ResponseEntity<?> getThreshold(HttpServletRequest request) {
        BigDecimal value = tradeService.getThreshold();
        boolean canEdit = canEditThreshold(request);
        return ResponseEntity.ok(Map.of("value", value, "canEdit", canEdit));
    }

    /** threshold 변경 (허용 IP만) */
    @PostMapping("/threshold")
    public ResponseEntity<?> updateThreshold(@RequestParam BigDecimal value, HttpServletRequest request) {
        if (!canEditThreshold(request)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("error", "권한 없음"));
        }
        if (value.compareTo(BigDecimal.ZERO) <= 0) {
            return ResponseEntity.badRequest().body(Map.of("error", "0보다 커야 합니다"));
        }
        if (value.compareTo(new BigDecimal("10000000")) > 0) {
            return ResponseEntity.badRequest().body(Map.of("error", "10,000,000 이하여야 합니다"));
        }
        if (value.stripTrailingZeros().scale() > 0) {
            return ResponseEntity.badRequest().body(Map.of("error", "정수만 입력 가능합니다"));
        }
        tradeService.updateThreshold(value);
        return ResponseEntity.ok(Map.of("value", value));
    }

    /** 조회 패널 페이지네이션 */
    @GetMapping
    public ResponseEntity<?> getPage(
            @RequestParam(required = false) String symbol,
            @RequestParam(required = false) String marketType,
            @RequestParam(required = false) String from,
            @RequestParam(required = false) String to,
            @RequestParam(defaultValue = "tradedAt") String sort,
            @RequestParam(defaultValue = "DESC") String order,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "30") int size) {
        return ResponseEntity.ok(queryService.getPage(symbol, marketType, from, to, sort, order, page, size));
    }
}
