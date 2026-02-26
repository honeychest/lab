// Purpose: 바이낸스 API 연동 서비스 — 시세 조회 및 계좌 잔고 반환
package com.chs.springboot.domain.binance.service;

import com.binance.connector.client.impl.SpotClientImpl;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import jakarta.annotation.PostConstruct;
import java.util.LinkedHashMap;

@Service
public class BinanceService {

    private static final Logger log = LoggerFactory.getLogger(BinanceService.class);

    @Value("${BINANCE_API_KEY}")
    private String apiKey;

    @Value("${BINANCE_SECRET_KEY}")
    private String secretKey;

    private SpotClientImpl client;

    @PostConstruct
    public void init() {
        // Jasypt가 자동으로 ENC(...)를 풀어서 apiKey에 주입해줍니다.
        // 그 덕분에 여기서는 평문 키를 사용하는 것과 똑같이 코드를 짜면 됩니다.
        try {
            this.client = new SpotClientImpl(apiKey, secretKey);
        } catch (Exception e) {
            log.error("[BinanceService] SpotClient 초기화 실패: {}", e.getMessage());
            throw new RuntimeException("바이낸스 클라이언트 초기화에 실패했습니다.", e);
        }
    }

    /**
     * 특정 코인 심볼의 현재 시세를 가져옵니다. (예: "BTCUSDT")
     */
    public String getSymbolPrice(String symbol) {
        try {
            LinkedHashMap<String, Object> parameters = new LinkedHashMap<>();
            parameters.put("symbol", symbol);
            return client.createMarket().tickerSymbol(parameters);
        } catch (Exception e) {
            log.error("[BinanceService] 시세 조회 실패 (symbol={}): {}", symbol, e.getMessage());
            throw new RuntimeException("시세 조회에 실패했습니다: " + symbol, e);
        }
    }

    /**
     * 내 계정의 잔고(Asset) 정보를 가져옵니다.
     */
    public String getAccountInformation() {
        try {
            LinkedHashMap<String, Object> parameters = new LinkedHashMap<>();
            // SpotClient를 사용해 계정 정보를 요청합니다. (API Key 권한 필요)
            return client.createTrade().account(parameters);
        } catch (Exception e) {
            log.error("[BinanceService] 계좌 정보 조회 실패: {}", e.getMessage());
            throw new RuntimeException("계좌 정보 조회에 실패했습니다.", e);
        }
    }
}