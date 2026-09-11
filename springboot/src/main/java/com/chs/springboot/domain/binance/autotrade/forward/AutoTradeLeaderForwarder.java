package com.chs.springboot.domain.binance.autotrade.forward;

import com.chs.springboot.domain.binance.autotrade.leader.AutoTradeExecutionRoute;
import com.chs.springboot.domain.binance.autotrade.leader.AutoTradeExecutionRouteKind;
import com.chs.springboot.domain.binance.autotrade.leader.AutoTradeExecutionRouter;
import jakarta.annotation.PreDestroy;
import jakarta.servlet.http.HttpServletRequest;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

@Slf4j
@Component
public class AutoTradeLeaderForwarder {

    static final String FORWARDED_HEADER = "X-Binance-AutoTrade-Forwarded";

    private final RestClient restClient;
    private final AutoTradeExecutionRouter executionRouter;
    private final Map<String, String> peerBaseUrls;
    private final String forwardSecret;
    private final long forwardTimeoutMs;
    private final ExecutorService forwardExecutor = Executors.newFixedThreadPool(2, runnable -> {
        Thread thread = new Thread(runnable, "binance-autotrade-forward");
        thread.setDaemon(true);
        return thread;
    });

    public AutoTradeLeaderForwarder(
            RestClient.Builder restClientBuilder,
            AutoTradeExecutionRouter executionRouter,
            @Value("#{${binance.autotrade.peer-base-url:{}}}") Map<String, String> peerBaseUrls,
            @Value("${binance.autotrade.internal-forward-secret:}") String forwardSecret,
            @Value("${binance.autotrade.forward-timeout-ms:5000}") long forwardTimeoutMs) {
        this.restClient = restClientBuilder.clone().build();
        this.executionRouter = executionRouter;
        this.peerBaseUrls = peerBaseUrls;
        this.forwardSecret = forwardSecret;
        this.forwardTimeoutMs = forwardTimeoutMs;
    }

    public AutoTradeForwardResponse forward(HttpServletRequest incoming, String path, String method, Object body) {
        AutoTradeExecutionRoute route = executionRouter.route();
        if (route.kind() == AutoTradeExecutionRouteKind.EXECUTE_HERE) {
            return unavailable("현재 서버가 이미 실행 리더입니다");
        }
        if (forwardSecret == null || forwardSecret.isBlank()) {
            return unavailable("자동매매 내부 전달 비밀값이 설정되지 않았습니다");
        }
        if (forwardSecret.equals(incoming.getHeader(FORWARDED_HEADER))) {
            return unavailable("자동매매 내부 전달이 재귀 호출되었습니다");
        }
        String baseUrl = peerBaseUrls.get(route.leaderName());
        if (baseUrl == null || baseUrl.isBlank()) {
            return unavailable("자동매매 실행 리더 주소가 설정되지 않았습니다");
        }

        Future<ResponseEntity<Map<String, Object>>> future = forwardExecutor.submit(() -> {
            RestClient.RequestBodySpec request = restClient.method(HttpMethod.valueOf(method))
                    .uri(baseUrl + path)
                    .headers(headers -> {
                        String cookie = incoming.getHeader(HttpHeaders.COOKIE);
                        if (cookie != null) {
                            headers.set(HttpHeaders.COOKIE, cookie);
                        }
                        headers.set(FORWARDED_HEADER, forwardSecret);
                    });
            RestClient.RequestHeadersSpec<?> prepared = body == null ? request : request.body(body);
            return prepared.retrieve().toEntity(new ParameterizedTypeReference<>() {
            });
        });
        try {
            ResponseEntity<Map<String, Object>> response = future.get(forwardTimeoutMs, TimeUnit.MILLISECONDS);
            return new AutoTradeForwardResponse(response, response.getHeaders().getFirst(HttpHeaders.SET_COOKIE));
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            future.cancel(true);
            return unavailable("자동매매 실행 서버 전달이 중단되었습니다");
        } catch (Exception e) {
            future.cancel(true);
            log.warn("자동매매 실행 서버 전달 실패 leader={} error={}", route.leaderName(), e.getMessage());
            return unavailable("자동매매 실행 서버에 연결할 수 없습니다");
        }
    }

    private AutoTradeForwardResponse unavailable(String message) {
        return new AutoTradeForwardResponse(
                ResponseEntity.status(503).body(Map.of("error", message)), null);
    }

    @PreDestroy
    public void shutdown() {
        forwardExecutor.shutdownNow();
    }
}
