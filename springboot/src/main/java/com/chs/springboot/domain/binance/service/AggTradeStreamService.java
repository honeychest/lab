// [AGENT] 역할: Binance aggTrade WebSocket 스트림 구독 서비스 (SPOT/FUTURES) | 연관파일: AggTradeStorageService.java(→enqueue), SignalSseService.java(→broadcastAggTrade), BinanceWebSocketStream.java(재연결 공통) | 핵심: @PostConstruct에서 BTCUSDT/ENAUSDT SPOT/FUTURES 4개 스트림 연결, 스트림별 독립 인스턴스로 재연결 누락 방지
package com.chs.springboot.domain.binance.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;

@Service
public class AggTradeStreamService {

    private static final Logger log = LoggerFactory.getLogger(AggTradeStreamService.class);

    private static final String SPOT_WS_BASE       = "wss://stream.binance.com:9443/ws/";
    private static final String FUTURES_WS_BASE    = "wss://fstream.binance.com/market/ws/";

    private final AggTradeStorageService storageService;
    private final SignalSseService       signalSseService;
    private final ObjectMapper objectMapper = new ObjectMapper();

    private final ScheduledExecutorService scheduler =
            Executors.newSingleThreadScheduledExecutor(r -> {
                Thread t = new Thread(r, "aggtrade-stream");
                t.setDaemon(false);
                return t;
            });

    private final List<BinanceWebSocketStream> streams = new ArrayList<>();

    public AggTradeStreamService(AggTradeStorageService storageService, SignalSseService signalSseService) {
        this.storageService   = storageService;
        this.signalSseService = signalSseService;
    }

    @PostConstruct
    public void start() {
        streams.add(createStream("btcusdt", "SPOT"));
        streams.add(createStream("btcusdt", "FUTURES"));
        streams.add(createStream("enausdt", "SPOT"));
        streams.add(createStream("enausdt", "FUTURES"));
        streams.forEach(BinanceWebSocketStream::connect);
    }

    private BinanceWebSocketStream createStream(String symbolLower, String marketType) {
        String symbolUpper = symbolLower.toUpperCase();
        String streamName = symbolLower + "@aggTrade";
        String base  = "SPOT".equals(marketType) ? SPOT_WS_BASE : FUTURES_WS_BASE;
        String url   = "SPOT".equals(marketType) ? base + streamName : base + streamName;
        String label = "AggTradeStream/" + symbolUpper + "/" + marketType;

        return new BinanceWebSocketStream(url, label,
                json -> handleMessage(json, symbolUpper, marketType),
                scheduler, 5);
    }

    private void handleMessage(String json, String symbolUpper, String marketType) {
        String payloadJson = json;
        try {
            var root = objectMapper.readTree(json);
            if (root.has("data")) {
                payloadJson = root.get("data").toString();
            }
        } catch (Exception ignore) {}

        // ENAUSDT FUTURES aggId 추적용 로그
        if ("ENAUSDT".equals(symbolUpper) && "FUTURES".equals(marketType)) {
            try {
                var node   = objectMapper.readTree(payloadJson);
                long aggId = node.get("a").asLong();
                log.debug("[AggTradeStreamDebug] RECV ENAUSDT FUTURES aggId={}", aggId);
            } catch (Exception ignore) {}
        }

        storageService.enqueue(payloadJson, symbolUpper, marketType);

        // Signal Dashboard SSE 브로드캐스트
        try {
            var node = objectMapper.readTree(payloadJson);
            Map<String, Object> dto = new HashMap<>();
            dto.put("symbol",       symbolUpper);
            dto.put("marketType",   marketType);
            dto.put("price",        node.get("p").asText());
            dto.put("quantity",     node.get("q").asText());
            dto.put("isBuyerMaker", node.get("m").asBoolean());
            dto.put("tradedAt",     node.get("T").asLong());
            signalSseService.broadcastAggTrade(dto);
        } catch (Exception ignore) {}

        log.debug("[AggTradeStream] enqueue 성공 {} {} (jsonLength={})", symbolUpper, marketType, payloadJson.length());
    }

    @PreDestroy
    public void stop() {
        streams.forEach(BinanceWebSocketStream::disconnect);
        scheduler.shutdownNow();
    }
}
