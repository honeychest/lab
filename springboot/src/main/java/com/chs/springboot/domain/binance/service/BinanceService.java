// [AGENT] 역할: 바이낸스 REST API 연동 서비스 (단발성 시세·계좌 조회, 실시간은 BinanceStreamService) | 연관파일: BinanceController.java | 주요메서드: init()(@PostConstruct, SpotClientImpl 초기화), getSymbolPrice(), getAccountInformation() | 보안: Jasypt ENC(...)로 API Key 복호화
// Purpose: 바이낸스 API 연동 서비스 — 시세 조회 및 계좌 잔고 반환

/**
 * ─────────────────────────────────────────────────────────────────
 *  이 클래스의 역할
 * ─────────────────────────────────────────────────────────────────
 *  바이낸스 공식 Java Connector 라이브러리를 통해
 *  REST API로 시세 조회 및 계좌 잔고를 가져오는 서비스.
 *
 *  사용 라이브러리:
 *    binance-connector-java (build.gradle에 추가된 바이낸스 공식 SDK)
 *    내부적으로 HTTPS 요청 + HMAC 서명 처리를 자동으로 해줌.
 *
 *  데이터 흐름:
 *    BinanceController → BinanceService → Binance REST API → JSON 응답
 *
 *  주의:
 *    실시간 시세는 이 클래스가 아닌 BinanceStreamService(WebSocket)로 처리.
 *    이 클래스는 REST API 용도만 (계좌 조회, 단발성 시세 조회).
 * ─────────────────────────────────────────────────────────────────
 */
package com.chs.springboot.domain.binance.service;

import com.binance.connector.client.impl.SpotClientImpl;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import jakarta.annotation.PostConstruct;
import java.util.LinkedHashMap;

/**
 * @Service:
 *   Spring이 이 클래스를 서비스 레이어 빈으로 등록.
 *   @Controller(BinanceController)에서 생성자 주입으로 사용.
 */
@Service
public class BinanceService {

    private static final Logger log = LoggerFactory.getLogger(BinanceService.class);

    /**
     * @Value("${BINANCE_API_KEY}"):
     *   application.properties 또는 환경변수에서 BINANCE_API_KEY 값을 읽어서 주입.
     *
     *   보안 처리 흐름:
     *     1. .env 파일에 BINANCE_API_KEY=ENC(암호화된값) 저장
     *     2. DotenvConfig가 .env를 읽어서 시스템 프로퍼티에 등록
     *     3. Jasypt가 ENC(...) 패턴을 감지해 자동으로 복호화
     *     4. 이 @Value에는 평문 API Key가 주입됨
     *
     *   덕분에 .env 파일이 유출되어도 원본 키 노출 방지.
     *   (복호화 비밀번호는 별도 환경변수로 관리)
     *
     *   jQuery 비유: PHP에서 $_ENV['BINANCE_API_KEY']로 환경변수 읽는 것과 유사.
     *   단, Java에서는 Spring이 자동으로 주입해줌.
     */
    @Value("${BINANCE_API_KEY}")
    private String apiKey;

    /**
     * @Value("${BINANCE_SECRET_KEY}"):
     *   HMAC 서명 생성에 사용되는 비밀키.
     *   계좌 조회 같은 인증이 필요한 API 호출 시 요청에 서명을 추가함.
     *   (SpotClientImpl 내부에서 자동 처리)
     */
    @Value("${BINANCE_SECRET_KEY}")
    private String secretKey;

    /**
     * client: 바이낸스 REST API를 호출하는 클라이언트 객체.
     *
     * SpotClientImpl:
     *   바이낸스 공식 Java Connector 라이브러리의 현물(Spot) 거래 클라이언트.
     *   내부에서 HTTP 요청, 서명, 응답 파싱 처리.
     *   시세 조회, 계좌 조회, 주문 등의 API를 메서드 호출로 사용 가능.
     *
     * @PostConstruct에서 초기화하는 이유:
     *   생성자에서 초기화하면 @Value가 아직 주입되기 전 (null)이라 오류 발생.
     *   @PostConstruct는 @Value 주입 완료 후 호출되므로 안전.
     */
    private SpotClientImpl client;

    /**
     * init: 앱 시작 시 SpotClientImpl 인스턴스를 생성.
     *
     * @PostConstruct 호출 시점:
     *   1. Spring이 BinanceService 빈 생성
     *   2. @Value(apiKey, secretKey) 주입 완료
     *   3. init() 자동 호출 → SpotClientImpl 생성
     *
     * 실패 시:
     *   API 키가 잘못되었거나 Jasypt 복호화 실패 등.
     *   RuntimeException을 던져서 앱 시작을 중단시킴.
     *   잘못된 설정으로 실행 중인 것보다 시작 실패가 더 안전.
     */
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
     * getSymbolPrice: 특정 거래 심볼의 현재 시세를 REST API로 조회.
     *
     * @param symbol 조회할 거래쌍 심볼. 예: "BTCUSDT", "ETHUSDT"
     * @return 바이낸스 API 응답 JSON 문자열
     *   예: {"symbol":"BTCUSDT","price":"42000.53000000"}
     *
     * LinkedHashMap<String, Object>:
     *   API 요청 파라미터를 담는 Map.
     *   LinkedHashMap = 삽입 순서를 유지하는 Map (HashMap은 순서 보장 없음).
     *   바이낸스 SDK가 이 Map을 쿼리 스트링으로 변환: ?symbol=BTCUSDT
     *
     * client.createMarket().tickerSymbol(parameters):
     *   바이낸스 REST API: GET /api/v3/ticker/price?symbol=BTCUSDT 호출.
     *   jQuery: $.ajax({ url: '/api/v3/ticker/price', data: { symbol: 'BTCUSDT' } }) 와 동일.
     *   단, SDK가 URL 구성, 인증, 요청/응답을 모두 처리.
     *
     * 예외 처리:
     *   RuntimeException으로 래핑해서 던지면
     *   BinanceController의 catch 블록에서 HTTP 503 응답으로 변환됨.
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
     * getAccountInformation: 내 바이낸스 계좌의 잔고 정보를 REST API로 조회.
     *
     * @return 바이낸스 API 응답 JSON 문자열
     *   예: {
     *     "balances": [
     *       {"asset":"BTC","free":"0.00250000","locked":"0.00000000"},
     *       {"asset":"USDT","free":"1000.00","locked":"0.00"},
     *       ...
     *     ],
     *     ...
     *   }
     *
     * client.createTrade().account(parameters):
     *   바이낸스 REST API: GET /api/v3/account 호출.
     *   이 API는 인증(서명)이 필요한 Signed Endpoint.
     *   SpotClientImpl이 내부적으로 HMAC-SHA256 서명을 자동으로 추가해줌.
     *
     * 서명 방식 (참고용):
     *   queryString = "timestamp=1708924800000"
     *   signature = HMAC-SHA256(queryString, secretKey) → HEX 문자열
     *   최종 URL: GET /api/v3/account?timestamp=...&signature=...
     *   이 모든 것을 SDK가 자동 처리.
     *
     * API 권한:
     *   바이낸스 API Key 생성 시 "Read Info" 권한이 필요.
     *   "Trading" 권한 없이도 조회 가능.
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
