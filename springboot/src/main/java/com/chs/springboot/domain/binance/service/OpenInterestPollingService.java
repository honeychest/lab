// [AGENT] Open Interest 폴링 서비스 — 1분마다 Binance API 호출, 리더만 실행
// 연관파일: OpenInterestRepository.java, SignalSseService.java, LeaderElectionService.java
// 주요메서드: pollOpenInterest() → @Scheduled(fixedRate = 60000)
package com.chs.springboot.domain.binance.service;

import com.chs.springboot.domain.binance.model.OpenInterest;
import com.chs.springboot.domain.binance.repository.OpenInterestRepository;
import com.chs.springboot.global.redis.LeaderElectionService;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.math.BigDecimal;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Slf4j
@Service
@RequiredArgsConstructor
public class OpenInterestPollingService {

    private final LeaderElectionService leaderElectionService;
    private final OpenInterestRepository openInterestRepository;
    private final SignalSseService signalSseService;
    private final RestTemplate restTemplate = new RestTemplate();
    private final ObjectMapper objectMapper = new ObjectMapper();

    private static final String OI_API_URL    = "https://fapi.binance.com/fapi/v1/openInterest";
    private static final String PRICE_API_URL = "https://fapi.binance.com/fapi/v1/ticker/price";
    private static final List<String> SYMBOLS = List.of("BTCUSDT", "ENAUSDT");

    @Scheduled(fixedRate = 60_000)
    public void pollOpenInterest() {
        if (!leaderElectionService.isLeader()) {
            return;
        }

        for (String symbol : SYMBOLS) {
            try {
                String url = OI_API_URL + "?symbol=" + symbol;
                String response = restTemplate.getForObject(url, String.class);

                JsonNode node = objectMapper.readTree(response);
                String oiValue = node.get("openInterest").asText();
                long timestamp = node.get("time").asLong() / 300_000L * 300_000L;

                // 현재가 조회
                BigDecimal price = null;
                try {
                    String priceResponse = restTemplate.getForObject(PRICE_API_URL + "?symbol=" + symbol, String.class);
                    JsonNode priceNode = objectMapper.readTree(priceResponse);
                    price = new BigDecimal(priceNode.get("price").asText());
                } catch (Exception pe) {
                    log.warn("[OI Polling] {} 현재가 조회 실패: {}", symbol, pe.getMessage());
                }

                OpenInterest oi = new OpenInterest();
                oi.setSymbol(symbol);
                oi.setOpenInterest(new BigDecimal(oiValue));
                oi.setPrice(price);
                oi.setCollectedAtMs(timestamp);

                openInterestRepository.insertIgnoreDuplicate(oi);

                Map<String, Object> dto = new HashMap<>();
                dto.put("symbol",        symbol);
                dto.put("openInterest",  oiValue);
                dto.put("collectedAtMs", timestamp);
                dto.put("price",         price != null ? price.toPlainString() : null);
                signalSseService.broadcastOiUpdate(dto);
            } catch (Exception e) {
                log.warn("[OI Polling] {} 실패: {}", symbol, e.getMessage());
            }
        }
    }
}
