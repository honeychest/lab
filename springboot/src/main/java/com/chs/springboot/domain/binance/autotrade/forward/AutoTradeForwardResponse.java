package com.chs.springboot.domain.binance.autotrade.forward;

import org.springframework.http.ResponseEntity;

import java.util.Map;

public record AutoTradeForwardResponse(ResponseEntity<Map<String, Object>> response,
                                       String setCookieHeader) {
}
