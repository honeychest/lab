package com.chs.springboot.domain.binance.autotrade.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.atomic.AtomicLong;
import java.util.stream.Collectors;

@Component
public class AutoTradeFuturesApiClient {

    private final HttpClient httpClient;
    private final ObjectMapper objectMapper;
    private final String baseUrl;
    private final String apiKey;
    private final String secretKey;
    private final AtomicLong serverOffsetMs = new AtomicLong();
    private final AtomicLong serverTimeSyncedAtMs = new AtomicLong();

    public AutoTradeFuturesApiClient(
            ObjectMapper objectMapper,
            @Value("${binance.autotrade.futures-base-url:${binance.rest.futures.base-url:https://fapi.binance.com}}") String baseUrl,
            @Value("${BINANCE_AUTOTRADE_API_KEY:}") String apiKey,
            @Value("${BINANCE_AUTOTRADE_SECRET_KEY:}") String secretKey) {
        this.httpClient = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();
        this.objectMapper = objectMapper;
        this.baseUrl = trimTrailingSlash(baseUrl);
        this.apiKey = apiKey == null ? "" : apiKey.trim();
        this.secretKey = secretKey == null ? "" : secretKey.trim();
    }

    public boolean isConfigured() {
        return !apiKey.isBlank() && !secretKey.isBlank();
    }

    public JsonNode getPublic(String path, Map<String, String> parameters) {
        return request("GET", path, parameters, false);
    }

    public JsonNode getSigned(String path, Map<String, String> parameters) {
        return request("GET", path, parameters, true);
    }

    public JsonNode postSigned(String path, Map<String, String> parameters) {
        return request("POST", path, parameters, true);
    }

    public JsonNode deleteSigned(String path, Map<String, String> parameters) {
        return request("DELETE", path, parameters, true);
    }

    private JsonNode request(String method,
                             String path,
                             Map<String, String> parameters,
                             boolean signed) {
        if (signed && !isConfigured()) {
            throw new AutoTradeFuturesApiException("자동매매 전용 선물 API 키가 설정되지 않았습니다", 0, false);
        }
        try {
            Map<String, String> requestParameters = new LinkedHashMap<>();
            if (parameters != null) {
                requestParameters.putAll(parameters);
            }
            if (signed) {
                requestParameters.put("timestamp", String.valueOf(exchangeTimeMs()));
                requestParameters.put("recvWindow", "5000");
                requestParameters.put("signature", sign(query(requestParameters)));
            }

            String query = query(requestParameters);
            URI uri = URI.create(baseUrl + path + (query.isBlank() ? "" : "?" + query));
            HttpRequest.Builder builder = HttpRequest.newBuilder()
                    .uri(uri)
                    .timeout(Duration.ofSeconds(10));
            if (signed) {
                builder.header("X-MBX-APIKEY", apiKey);
            }
            HttpRequest request = switch (method) {
                case "GET" -> builder.GET().build();
                case "POST" -> builder.POST(HttpRequest.BodyPublishers.noBody()).build();
                case "DELETE" -> builder.DELETE().build();
                default -> throw new IllegalArgumentException("지원하지 않는 HTTP 메서드: " + method);
            };
            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() < 200 || response.statusCode() >= 300) {
                throw new AutoTradeFuturesApiException(
                        "Binance 선물 API 응답 오류: HTTP " + response.statusCode() + " " + response.body(),
                        response.statusCode(), response.statusCode() >= 500);
            }
            return objectMapper.readTree(response.body().isBlank() ? "{}" : response.body());
        } catch (AutoTradeFuturesApiException e) {
            throw e;
        } catch (Exception e) {
            throw new AutoTradeFuturesApiException(
                    "Binance 선물 API 호출에 실패했습니다", e, 0, true);
        }
    }

    private long exchangeTimeMs() {
        long now = System.currentTimeMillis();
        long syncedAt = serverTimeSyncedAtMs.get();
        if (now - syncedAt > 30_000L) {
            synchronized (serverTimeSyncedAtMs) {
                syncedAt = serverTimeSyncedAtMs.get();
                if (now - syncedAt > 30_000L) {
                    JsonNode response = getPublic("/fapi/v1/time", Map.of());
                    long serverTime = response.path("serverTime").asLong(-1L);
                    if (serverTime < 0) {
                        throw new AutoTradeFuturesApiException("Binance 선물 서버 시각이 없습니다", 200, true);
                    }
                    serverOffsetMs.set(serverTime - now);
                    serverTimeSyncedAtMs.set(now);
                }
            }
        }
        return System.currentTimeMillis() + serverOffsetMs.get();
    }

    private String sign(String query) throws Exception {
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(secretKey.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
        byte[] digest = mac.doFinal(query.getBytes(StandardCharsets.UTF_8));
        StringBuilder result = new StringBuilder(digest.length * 2);
        for (byte value : digest) {
            result.append(String.format("%02x", value));
        }
        return result.toString();
    }

    private String query(Map<String, String> parameters) {
        return parameters.entrySet().stream()
                .map(entry -> encode(entry.getKey()) + "=" + encode(entry.getValue()))
                .collect(Collectors.joining("&"));
    }

    private String encode(String value) {
        return URLEncoder.encode(value, StandardCharsets.UTF_8);
    }

    private String trimTrailingSlash(String value) {
        if (value == null || value.isBlank()) {
            return "https://fapi.binance.com";
        }
        return value.endsWith("/") ? value.substring(0, value.length() - 1) : value;
    }
}
