// Purpose: 바이낸스 REST API 엔드포인트 — 시세 및 계좌 잔고 요청 처리
package com.chs.springboot.domain.binance.controller;

import com.chs.springboot.domain.binance.service.BinanceService;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import lombok.RequiredArgsConstructor;

@RestController
@RequestMapping("/api/binance")
@RequiredArgsConstructor
public class BinanceController {

    private final BinanceService binanceService;

    // 리액트에서 이 주소를 호출하면 실시간 비트코인 가격을 반환합니다.
    @GetMapping("/price")
    public ResponseEntity<String> getBtcPrice() {
        try {
            return ResponseEntity.ok(binanceService.getSymbolPrice("BTCUSDT"));
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                    .body("시세 조회에 실패했습니다. 잠시 후 다시 시도해주세요.");
        }
    }

    // 내 지갑의 잔고 정보를 반환합니다.
    @GetMapping("/account")
    public ResponseEntity<String> getAccountInfo() {
        try {
            return ResponseEntity.ok(binanceService.getAccountInformation());
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                    .body("계좌 정보 조회에 실패했습니다. 잠시 후 다시 시도해주세요.");
        }
    }
}