// [AGENT] 역할: 바이낸스 REST API 엔드포인트 | 연관파일: BinanceService.java | 주요메서드: getBtcPrice() → GET /api/binance/price (503 폴백), getAccountInfo() → GET /api/binance/account (503 폴백)
// Purpose: 바이낸스 REST API 엔드포인트 — 시세 및 계좌 잔고 요청 처리

/**
 * ─────────────────────────────────────────────────────────────────
 *  이 클래스의 역할 (얇은 진입점 레이어)
 * ─────────────────────────────────────────────────────────────────
 *  프론트엔드의 axios/fetch 요청을 받아서 BinanceService에 위임하고
 *  응답을 HTTP 형식으로 반환하는 역할.
 *
 *  Controller는 "무엇을 요청했는지" 파악하고,
 *  실제 로직은 Service에 위임하는 것이 Spring MVC 원칙.
 *
 *  엔드포인트 목록:
 *    GET /api/binance/price   → BTC/USDT 현재 시세 JSON
 *    GET /api/binance/account → 내 계좌 잔고 JSON
 *
 *  jQuery 비유:
 *    PHP에서 switch($_GET['action']) { case 'price': ...; case 'account': ...; }
 *    처럼 URL에 따라 다른 처리를 하는 라우터 역할.
 *    단, Spring이 URL 매핑을 자동으로 처리.
 * ─────────────────────────────────────────────────────────────────
 */
package com.chs.springboot.domain.binance.controller;

import com.chs.springboot.domain.binance.service.BinanceService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import lombok.RequiredArgsConstructor;

/**
 * @RestController:
 *   @Controller + @ResponseBody 합성 어노테이션.
 *   메서드 반환값이 자동으로 HTTP 응답 본문(body)이 됨.
 *   반환 타입이 String이면 Content-Type: text/plain 또는 application/json 으로 전송.
 *   jQuery에서 $.ajax 응답으로 받는 data가 여기서 반환하는 값.
 *
 * @RequestMapping("/api/binance"):
 *   이 컨트롤러의 모든 메서드 URL에 "/api/binance" 접두사 적용.
 *   예: @GetMapping("/price") → 실제 URL은 /api/binance/price
 *
 * @RequiredArgsConstructor (Lombok):
 *   final 필드를 받는 생성자를 자동 생성.
 *   아래 binanceService 필드에 Spring이 자동으로 BinanceService 빈을 주입.
 *   수동으로 생성자를 작성하지 않아도 됨 (코드 간소화).
 */
@RestController
@RequestMapping("/api/binance")
@RequiredArgsConstructor
public class BinanceController {

    private static final Logger log = LoggerFactory.getLogger(BinanceController.class);

    /**
     * binanceService: 실제 바이낸스 API 호출을 처리하는 서비스.
     * @RequiredArgsConstructor가 생성자를 만들어 Spring이 자동 주입.
     * final = 한 번 주입되면 변경 불가 (불변성 보장).
     */
    private final BinanceService binanceService;

    /**
     * getBtcPrice: BTC/USDT 현재 시세 조회 엔드포인트.
     *
     * @GetMapping("/price"):
     *   HTTP GET /api/binance/price 요청을 이 메서드에 매핑.
     *   jQuery: $.ajax({ method: 'GET', url: '/api/binance/price' }) 로 호출.
     *   프론트엔드 useBinanceWebSocket.ts는 WebSocket으로 시세를 받으므로
     *   이 엔드포인트는 현재 직접 사용되지 않으나 참조용으로 유지.
     *
     * @return ResponseEntity<String>:
     *   HTTP 응답 전체를 감싸는 객체.
     *   ResponseEntity.ok(body)     → HTTP 200 OK + body
     *   ResponseEntity.status(503)  → HTTP 503 Service Unavailable
     *     status(503).body(msg)     → 503 + 에러 메시지
     *
     *   HttpStatus.SERVICE_UNAVAILABLE = 503:
     *     서버는 정상이나 외부 서비스(바이낸스) 오류를 의미.
     *     500 Internal Server Error가 아닌 503을 쓰는 이유:
     *       500 = 우리 서버의 버그
     *       503 = 외부 의존성(바이낸스) 오류로 일시적으로 서비스 불가
     *
     *   jQuery: $.ajax error 콜백의 xhr.status 가 503이 됨.
     */
    @GetMapping("/price")
    public ResponseEntity<String> getBtcPrice() {
        try {
            return ResponseEntity.ok(binanceService.getSymbolPrice("BTCUSDT"));
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                    .body("시세 조회에 실패했습니다. 잠시 후 다시 시도해주세요.");
        }
    }

    /**
     * getAccountInfo: 내 바이낸스 계좌 잔고 조회 엔드포인트.
     *
     * @GetMapping("/account"):
     *   HTTP GET /api/binance/account 요청 처리.
     *   프론트엔드 BinancePage.jsx에서 axios.get('/api/binance/account') 로 호출.
     *   vite.config.js 프록시: /api → http://localhost:8080 으로 자동 전달.
     *
     * @return 성공 시: HTTP 200 + 계좌 잔고 JSON 문자열
     *         실패 시: HTTP 503 + 한국어 에러 메시지
     *
     * 응답 JSON 예시:
     *   {
     *     "balances": [
     *       {"asset": "BTC", "free": "0.00250000", "locked": "0.00000000"},
     *       {"asset": "USDT", "free": "1000.00", "locked": "0.00"}
     *     ]
     *   }
     *
     * 프론트엔드에서의 처리:
     *   axios.get('/api/binance/account').then(res => res.data)
     *   res.data = 이 메서드가 반환한 JSON 문자열.
     *   axios가 자동으로 JSON 파싱: res.data.balances[0].asset 접근 가능.
     */
    @GetMapping("/account")
    public ResponseEntity<String> getAccountInfo() {
        try {
            String body = binanceService.getAccountInformation();
            return ResponseEntity.ok(body);
        } catch (Exception e) {
            log.error("[BinanceController] GET /api/binance/account 실패 | 예외클래스={} | 메시지={} | cause={}",
                    e.getClass().getName(), e.getMessage(), e.getCause() != null ? e.getCause().getMessage() : null);
            if (e.getCause() != null) {
                log.error("[BinanceController] cause 상세 | 클래스={} | 메시지={}", e.getCause().getClass().getName(), e.getCause().getMessage());
            }
            log.error("[BinanceController] 계좌 조회 실패 스택 트레이스", e);
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                    .body("계좌 정보 조회에 실패했습니다. 잠시 후 다시 시도해주세요.");
        }
    }
}
