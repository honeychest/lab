// [AGENT] BTC 체결 API 컨트롤러 | 연관파일: BinanceTradeSseService.java, BinanceTradeQueryService.java
// 엔드포인트: GET /api/binance/trades/sse, GET /api/binance/trades/recent, GET /api/binance/trades
package com.chs.springboot.domain.binance.controller;

import com.chs.springboot.domain.binance.service.BinanceTradeQueryService;
import com.chs.springboot.domain.binance.service.BinanceTradeSseService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

@RestController
@RequestMapping("/api/binance/trades")
@RequiredArgsConstructor
public class BinanceTradeController {

    private final BinanceTradeSseService sseService;
    private final BinanceTradeQueryService queryService;

    /** SSE 구독 */
    @GetMapping(value = "/sse", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter subscribe() {
        return sseService.subscribe();
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
