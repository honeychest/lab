package com.chs.springboot.domain.binance.service;

import com.binance.connector.client.impl.SpotClientImpl;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import jakarta.annotation.PostConstruct;
import java.util.LinkedHashMap;

@Service
public class BinanceService {

    @Value("${BINANCE_API_KEY}")
    private String apiKey;

    @Value("${BINANCE_SECRET_KEY}")
    private String secretKey;

    private SpotClientImpl client;

    @PostConstruct
    public void init() {
        // Jasypt가 자동으로 ENC(...)를 풀어서 apiKey에 주입해줍니다.
        // 그 덕분에 여기서는 평문 키를 사용하는 것과 똑같이 코드를 짜면 됩니다.
        this.client = new SpotClientImpl(apiKey, secretKey);
    }

    /**
     * 비트코인(BTC/USDT) 현재 시세 가져오기
     */
    public String getBtcPrice() {
        LinkedHashMap<String, Object> parameters = new LinkedHashMap<>();
        parameters.put("symbol", "BTCUSDT");

        // 마켓 정보 중 티커(시세)를 가져옵니다.
        return client.createMarket().tickerSymbol(parameters);
    }

    /**
     * 특정 코인 심볼을 파라미터로 받는 메서드 (컨트롤러와 호환용)
     */
    public String getSymbolPrice(String symbol) {
        LinkedHashMap<String, Object> parameters = new LinkedHashMap<>();
        parameters.put("symbol", symbol);
        return client.createMarket().tickerSymbol(parameters);
    }

    /**
     * 내 계정의 잔고(Asset) 정보를 가져옵니다.
     */
    public String getAccountInformation() {
        LinkedHashMap<String, Object> parameters = new LinkedHashMap<>();
        // SpotClient를 사용해 계정 정보를 요청합니다. (API Key 권한 필요)
        return client.createTrade().account(parameters);
    }
}