package com.chs.springboot.domain.binance.controller;

import com.chs.springboot.domain.binance.service.BinanceService;
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
    public String getBtcPrice() {
        return binanceService.getSymbolPrice("BTCUSDT");
    }

    // 내 지갑의 잔고 정보를 반환합니다.
    @GetMapping("/account")
    public String getAccountInfo() {
        return binanceService.getAccountInformation();
    }
}