// [AGENT] Signal Dashboard REST + SSE 컨트롤러 — /api/signal/* 엔드포인트
// 연관파일: SignalDataService.java, SignalSseService.java
// 주요엔드포인트: GET /init, GET /history, GET /patterns, GET /stream/sse
package com.chs.springboot.domain.binance.controller;

import com.chs.springboot.domain.binance.service.SignalDataService;
import com.chs.springboot.domain.binance.service.SignalSseService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

@Slf4j
@RestController
@RequestMapping("/api/signal")
@RequiredArgsConstructor
public class SignalController {

    private final SignalDataService signalDataService;
    private final SignalSseService signalSseService;

    @GetMapping("/init")
    public ResponseEntity<Map<String, Object>> init(@RequestParam String symbol) {
        log.debug("[SignalController] /init symbol={}", symbol);
        Map<String, Object> data = signalDataService.getInitData(symbol);
        return ResponseEntity.ok(data);
    }

    @GetMapping("/history")
    public ResponseEntity<Map<String, Object>> history(
            @RequestParam String symbol,
            @RequestParam String range) {
        log.debug("[SignalController] /history symbol={} range={}", symbol, range);
        Map<String, Object> data = signalDataService.getHistoryData(symbol, range);
        return ResponseEntity.ok(data);
    }

    @GetMapping("/patterns")
    public ResponseEntity<List<Map<String, Object>>> patterns(
            @RequestParam String symbol,
            @RequestParam BigDecimal volume) {
        log.debug("[SignalController] /patterns symbol={} volume={}", symbol, volume);
        List<Map<String, Object>> patterns = signalDataService.findPatterns(symbol, volume);
        return ResponseEntity.ok(patterns);
    }

    @GetMapping(value = "/stream/sse", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter streamSse(@RequestParam String symbol) {
        log.debug("[SignalController] /stream/sse symbol={}", symbol);
        return signalSseService.subscribe();
    }
}
