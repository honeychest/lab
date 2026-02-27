// Purpose: 바이낸스 WebSocket 스트림 구독 — 실시간 시세를 프론트엔드 클라이언트로 중계

/**
 * ─────────────────────────────────────────────────────────────────
 *  이 클래스의 역할 (데이터 수집기 + 중계자)
 * ─────────────────────────────────────────────────────────────────
 *  바이낸스 공식 WebSocket 스트림에 연결해서 실시간 BTC 시세를 받고,
 *  연결된 모든 프론트엔드 클라이언트에게 그대로 중계(relay)하는 역할.
 *
 *  동작 흐름:
 *    앱 시작(@PostConstruct) → Binance WS 연결 시도
 *      ↓ 연결 성공
 *    BinanceListener.onText() 계속 호출 (초당 ~1회)
 *      ↓
 *    BinancePriceWebSocketHandler.broadcastPrice() 호출
 *      ↓
 *    연결된 모든 브라우저 탭에 JSON 전송
 *
 *  오류 시:
 *    연결 실패 또는 끊김 → 3초 후 자동 재연결 (scheduleReconnect)
 *
 *  종료 시:
 *    @PreDestroy(앱 종료) → 재연결 중단 + WS 정상 종료
 *
 *  jQuery 비유:
 *    마치 서버 측에서 setInterval로 $.ajax를 계속 호출해서 데이터를 받아
 *    다른 클라이언트들에게 전달하는 역할인데,
 *    여기서는 setInterval 대신 WebSocket을 사용해서 더 효율적.
 * ─────────────────────────────────────────────────────────────────
 */
package com.chs.springboot.domain.binance.service;

import com.chs.springboot.domain.binance.websocket.BinancePriceWebSocketHandler;
import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.net.URI;
import java.net.http.HttpClient;
import java.util.concurrent.CompletionStage;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

/**
 * @Service:
 *   Spring이 이 클래스를 서비스 빈으로 등록.
 *   앱 시작 시 자동으로 인스턴스 생성 → @PostConstruct 실행 → Binance 연결 시작.
 */
@Service
public class BinanceStreamService {

    private static final Logger log = LoggerFactory.getLogger(BinanceStreamService.class);

    /**
     * BINANCE_STREAM_URL: 바이낸스 공식 실시간 시세 WebSocket 주소.
     *
     * 형식 분석:
     *   wss://                        = WebSocket Secure (HTTPS처럼 암호화)
     *   stream.binance.com:9443       = 바이낸스 스트림 서버, 포트 9443
     *   /ws/                          = WebSocket 경로
     *   btcusdt@ticker                = 구독할 스트림 이름
     *                                   btcusdt = BTC/USDT 거래쌍
     *                                   @ticker = 24시간 롤링 통계 스트림 타입
     *
     * 다른 스트림 예시:
     *   ethusdt@ticker   = ETH/USDT 시세
     *   btcusdt@trade    = 실시간 체결 내역
     *   btcusdt@kline_1m = 1분봉 캔들 데이터
     */
    // 기본 심볼 (소문자) - 초기값은 BTCUSDT
    private static final String DEFAULT_SYMBOL = "btcusdt";

    /**
     * 현재 구독 중인 심볼. 소문자로 저장하여 URL 생성 시 대소문자 걱정 없음.
     * 이 값은 클라이언트 요청에 따라 변경될 수 있으며, 변경 시 기존
     * WebSocket을 닫고 새 URL로 재접속한다.
     */
    private volatile String currentSymbol = DEFAULT_SYMBOL;

    /**
     * Binance 스트림 URL 템플릿의 공통 접두사/접미사.
     * 실제 접속 URL은 getStreamUrl() 메서드에서 currentSymbol을 끼워넣어 생성.
     */
    private static final String STREAM_URL_PREFIX = "wss://stream.binance.com:9443/ws/";
    private static final String STREAM_URL_SUFFIX = "@ticker";

    /**
     * RECONNECT_DELAY_SEC: 재연결 시도 전 대기 시간 (초 단위).
     * 연결 실패/끊김 후 즉시 재연결하지 않는 이유:
     *   - 서버 문제라면 즉시 재연결해도 계속 실패 (CPU/네트워크 낭비)
     *   - 3초 대기 후 재시도 = backoff 전략의 단순화 버전
     */
    private static final int RECONNECT_DELAY_SEC = 3;

    /**
     * handler: 프론트엔드 WebSocket 세션 관리자.
     * broadcastPrice() 호출로 시세를 모든 클라이언트에게 전송.
     * 생성자 주입(Constructor Injection)으로 Spring이 자동 제공.
     */
    private final BinancePriceWebSocketHandler handler;

    /**
     * notificationService: 오류 발생 시 알림을 보내는 서비스 인터페이스.
     * 현재는 LogNotificationService가 로그로만 출력.
     * 추후 TelegramNotificationService로 교체 가능 (인터페이스 덕분에 코드 변경 최소화).
     * 생성자 주입으로 Spring이 자동으로 LogNotificationService 구현체를 주입.
     */
    private final NotificationService notificationService;

    /**
     * scheduler: 재연결 지연 타이머를 담당하는 스케줄러.
     *
     * ScheduledExecutorService:
     *   Java의 고급 스케줄링 도구. schedule(task, delay, unit) 으로 지연 실행.
     *   jQuery의 setTimeout(fn, 3000) 과 동일한 역할.
     *
     * Executors.newSingleThreadScheduledExecutor():
     *   스레드 1개짜리 스케줄러 생성.
     *   재연결 작업은 순서가 중요하고 동시에 여러 번 실행될 필요가 없으므로 1개로 충분.
     *
     * final로 선언된 이유:
     *   한 번 생성 후 교체할 일이 없음 (앱 종료 시까지 동일 인스턴스 사용).
     */
    private final ScheduledExecutorService scheduler = Executors.newSingleThreadScheduledExecutor();

    /**
     * binanceWs: 현재 연결된 바이낸스 WebSocket 객체.
     *
     * java.net.http.WebSocket:
     *   Java 11부터 제공되는 표준 HTTP Client 라이브러리의 WebSocket 클라이언트.
     *   외부 라이브러리 없이 사용 가능.
     *   앱 종료 시 sendClose()로 정상 종료에 사용.
     *
     * volatile:
     *   멀티스레드 환경에서 이 변수의 최신 값을 항상 메인 메모리에서 읽도록 보장.
     *   없으면 스레드별 캐시 때문에 다른 스레드가 갱신한 값을 못 볼 수 있음.
     *   jQuery 비유: 없음 (JS는 단일 스레드이므로 이런 문제가 없음)
     */
    private java.net.http.WebSocket binanceWs;

    /**
     * running: 서비스가 실행 중인지 나타내는 플래그.
     * true  = 정상 운영 중 (연결 유지, 재연결 허용)
     * false = 종료 요청됨 (@PreDestroy 호출됨, 재연결 중단)
     *
     * volatile: 다른 스레드(scheduler 스레드)에서도 최신 값을 보기 위해.
     */
    private volatile boolean running = true;

    /**
     * connectionGeneration: 연결 세대(generation) 카운터.
     *
     * 문제 상황 (심볼 변경 시 연결 중복):
     *   setSymbol() 호출 시:
     *     ① 기존 연결에 sendClose() — 비동기라 즉시 닫히지 않음
     *     ② connectToBinance() 호출 → 새 연결 시작
     *     ③ 기존 리스너의 onClose()가 뒤늦게 실행 → scheduleReconnect() 호출
     *     → 기존 + 신규 연결이 동시에 살아있어 같은 세션에 중복 broadcast → 충돌
     *
     * 해결:
     *   connectToBinance() 호출 시마다 이 카운터를 증가시키고,
     *   각 BinanceListener 인스턴스가 생성 시점의 세대 값을 기억.
     *   onClose() / onError()에서 현재 세대와 다르면 재연결을 무시.
     *
     *   예시:
     *     BTC 리스너 (generation=1) → onClose() 도착
     *     현재 connectionGeneration=2 (이미 ETH로 교체됨)
     *     1 ≠ 2 → 재연결 무시 ✅
     */
    private volatile int connectionGeneration = 0;

    /**
     * 생성자 (Constructor Injection):
     * Spring이 BinancePriceWebSocketHandler와 NotificationService 빈을 찾아서
     * 자동으로 이 생성자를 호출해 주입.
     *
     * jQuery에서 플러그인 초기화 시 options를 받는 것과 유사:
     *   $.fn.binanceStream = function(handler, notificationService) { ... }
     * 단, Spring은 자동으로 필요한 객체를 찾아 넘겨줌.
     */
    public BinanceStreamService(BinancePriceWebSocketHandler handler,
                                NotificationService notificationService) {
        this.handler = handler;
        this.notificationService = notificationService;
    }

    /**
     * @PostConstruct: Spring이 이 빈(Bean)을 생성하고 의존성 주입을 완료한 직후 자동 호출.
     *
     * 호출 타이밍:
     *   new BinanceStreamService(handler, notificationService) 완료 후 바로 실행.
     *   즉, 앱이 시작되면 자동으로 바이낸스 연결이 시작됨.
     *
     * jQuery 비유:
     *   $(document).ready(function() { connectToBinance(); }); 와 유사.
     *   단, 이것은 서버 측이므로 브라우저가 아닌 Spring 앱 시작 시 실행.
     */
    @PostConstruct
    public void connect() {
        connectToBinance();
    }

    /**
     * SymbolChangeEvent 처리: Handler에서 클라이언트가 요청한 심볼을
     * 전달하는 이벤트를 수신하면 setSymbol() 호출.
     *
     * @param evt 변경 요청 이벤트
     */
    @org.springframework.context.event.EventListener
    public void handleSymbolChange(SymbolChangeEvent evt) {
        setSymbol(evt.getSymbol());
    }

    /**
     * connectToBinance: 바이낸스 WebSocket 서버에 비동기 연결을 시도.
     *
     * running 체크:
     *   @PreDestroy가 호출된 후에는 재연결 시도 안 함.
     *   앱 종료 중에 무한 재연결 루프 방지.
     *
     * HttpClient.newHttpClient():
     *   Java 11 표준 HTTP 클라이언트 생성.
     *   매번 새로 생성하는 이유: WebSocket 재연결 시마다 새 연결 필요.
     *   (최적화하려면 필드로 싱글턴 관리 가능하나 현재는 단순성 우선)
     *
     * .newWebSocketBuilder():
     *   WebSocket 클라이언트 빌더 생성. (Builder 패턴)
     *
     * .buildAsync(URI, Listener):
     *   비동기 연결 시작. 이 메서드는 즉시 반환되고 내부에서 백그라운드 연결 진행.
     *   jQuery: $.ajax와 달리 응답을 기다리지 않고 즉시 다음 코드 실행.
     *   연결 완료/실패는 CompletableFuture의 .thenAccept() / .exceptionally()에서 처리.
     *
     * .thenAccept(ws -> {...}):
     *   연결 성공 시 실행될 콜백. ws = 연결된 WebSocket 객체.
     *   jQuery: $.ajax success 콜백과 유사.
     *
     * .exceptionally(e -> {...}):
     *   연결 실패 시 실행될 콜백.
     *   jQuery: $.ajax error 콜백과 유사.
     */
    private void connectToBinance() {
        if (!running) return;
        // 새 연결 시작 시 세대 카운터 증가 — 이전 리스너의 onClose가 재연결하지 못하도록 무효화
        final int myGeneration = ++connectionGeneration;
        try {
            String url = getStreamUrl();
            log.info("[BinanceStream] {} 심볼로 연결 시도 (generation={})", currentSymbol, myGeneration);
            HttpClient.newHttpClient()
                    .newWebSocketBuilder()
                    .buildAsync(URI.create(url), new BinanceListener(myGeneration))
                    .thenAccept(ws -> {
                        this.binanceWs = ws;
                        log.info("[BinanceStream] 바이낸스 WebSocket 연결 성공 ({} )", url);
                    })
                    .exceptionally(e -> {
                        log.error("[BinanceStream] 연결 실패: {}", e.getMessage());
                        scheduleReconnect(); // 실패 시 3초 후 재시도
                        return null;
                    });
        } catch (Exception e) {
            log.error("[BinanceStream] 연결 오류: {}", e.getMessage());
            scheduleReconnect();
        }
    }

    /**
     * scheduleReconnect: 3초 후 재연결을 예약.
     *
     * running 체크:
     *   앱 종료 중에는 재연결 예약 안 함.
     *
     * scheduler.schedule(task, delay, unit):
     *   task  = 지연 후 실행할 작업 (this::connectToBinance = 메서드 참조)
     *   delay = 지연 시간 값 (3)
     *   unit  = 시간 단위 (TimeUnit.SECONDS = 초)
     *
     *   jQuery 비유:
     *     setTimeout(function() { connectToBinance(); }, 3000);
     *     와 완전히 동일한 동작. (1000ms = 1초 단위 차이만 있음)
     *
     * this::connectToBinance:
     *   Java 메서드 참조 문법. () -> connectToBinance() 를 줄여 쓴 것.
     *   jQuery에서 function() { connectToBinance(); } 람다와 동일.
     */
    private void scheduleReconnect() {
        if (!running) return;
        log.info("[BinanceStream] {}초 후 재연결 시도", RECONNECT_DELAY_SEC);
        scheduler.schedule(this::connectToBinance, RECONNECT_DELAY_SEC, TimeUnit.SECONDS);
    }

    /**
     * setSymbol: 외부(Handler)에서 요청된 새 심볼로 변경.
     *
     * - 같은 심볼 요청은 무시하여 불필요한 재접속 방지.
     * - 심볼은 소문자로 바꿔 저장.
     * - 기존 WebSocket은 정상 종료 후 곧바로 새 연결을 시도.
     */
    public synchronized void setSymbol(String symbol) {
        if (symbol == null || symbol.isEmpty()) return;
        String lower = symbol.toLowerCase();
        if (lower.equals(currentSymbol)) return;
        log.info("[BinanceStream] 심볼 변경: {} -> {}", currentSymbol, lower);
        currentSymbol = lower;
        if (binanceWs != null) {
            try {
                binanceWs.sendClose(java.net.http.WebSocket.NORMAL_CLOSURE, "symbol changed");
            } catch (Exception ignored) {}
        }
        // 즉시 새 심볼로 연결 시도
        connectToBinance();
    }

    /**
     * getStreamUrl: 현재 심볼에 맞는 Binance WebSocket URL 생성
     */
    private String getStreamUrl() {
        return STREAM_URL_PREFIX + currentSymbol + STREAM_URL_SUFFIX;
    }

    /**
     * @PreDestroy: Spring 컨텍스트가 종료될 때 (앱 셧다운) 자동 호출.
     * 앱이 꺼지기 전에 리소스를 정리하는 메서드.
     *
     * jQuery 비유:
     *   $(window).on('beforeunload', function() { cleanup(); }); 와 유사.
     *   단, 이것은 서버 측.
     *
     * 처리 순서:
     *   1. running = false → 이후 reconnect 시도 차단
     *   2. scheduler.shutdownNow() → 예약된 재연결 작업 취소 + 스레드 종료
     *   3. binanceWs.sendClose() → 바이낸스 서버에 정상 종료 알림
     *      sendClose(NORMAL_CLOSURE, reason):
     *        NORMAL_CLOSURE = 1000 (정상 종료 코드)
     *        "shutdown" = 종료 이유 메시지
     *
     * 왜 정상 종료가 중요한가:
     *   갑자기 연결을 끊으면 바이낸스 서버가 비정상 종료로 판단할 수 있음.
     *   sendClose()로 명시적으로 알리면 서버가 리소스를 바로 정리할 수 있음.
     */
    @PreDestroy
    public void disconnect() {
        running = false;
        scheduler.shutdownNow();
        if (binanceWs != null) {
            binanceWs.sendClose(java.net.http.WebSocket.NORMAL_CLOSURE, "shutdown");
        }
    }

    // ─────────────────────────────────────────────────────────────
    //  내부 클래스: BinanceListener (WebSocket 이벤트 핸들러)
    // ─────────────────────────────────────────────────────────────

    /**
     * BinanceListener: 바이낸스 WebSocket에서 오는 이벤트를 처리하는 내부 클래스.
     *
     * private class (비공개 내부 클래스):
     *   BinanceStreamService 안에서만 사용. 외부에서 직접 접근 불가.
     *
     * implements java.net.http.WebSocket.Listener:
     *   Java 11 표준 WebSocket 이벤트 리스너 인터페이스 구현.
     *   오버라이드할 메서드:
     *     onText()  = 텍스트 메시지 수신 시
     *     onClose() = 연결 종료 시
     *     onError() = 오류 발생 시
     *     (onBinary, onPing, onPong 등은 기본 구현 사용)
     *
     * jQuery 비유:
     *   var listener = {
     *     onText: function(data) {...},
     *     onClose: function() {...},
     *     onError: function(e) {...}
     *   };
     *   ws.on('message', listener.onText);
     *   ws.on('close', listener.onClose);
     *   ws.on('error', listener.onError);
     */
    private class BinanceListener implements java.net.http.WebSocket.Listener {

        /**
         * generation: 이 리스너가 생성될 때의 connectionGeneration 값.
         * onClose() / onError()에서 현재 connectionGeneration과 비교해
         * 이 리스너가 여전히 "현재 연결"인지 확인하는 데 사용.
         * 심볼 변경으로 새 연결이 시작되면 이 값이 현재 값과 달라져 재연결을 무시.
         */
        private final int generation;

        BinanceListener(int generation) {
            this.generation = generation;
        }

        /**
         * buffer: 분할 수신된 메시지 조각을 모으는 임시 버퍼.
         *
         * WebSocket 메시지 분할 전송(fragmentation):
         *   큰 메시지는 여러 조각(frame)으로 나눠서 전송될 수 있음.
         *   각 조각이 onText()로 호출되고 마지막 조각에만 last=true.
         *   조각들을 StringBuilder로 모았다가 last=true일 때 한 번에 처리.
         *
         * 바이낸스 ticker 메시지는 작아서 보통 한 번에 오지만,
         * 표준 구현으로 분할 전송도 안전하게 처리.
         *
         * StringBuilder vs String:
         *   String은 + 연산마다 새 객체 생성 (메모리 낭비).
         *   StringBuilder는 내부 배열에 append → 효율적.
         *   jQuery에서 var parts = []; parts.push(chunk); result = parts.join(''); 와 유사.
         */
        private final StringBuilder buffer = new StringBuilder();

        /**
         * onText: 바이낸스에서 텍스트 메시지(JSON)를 받을 때마다 호출.
         *
         * @param ws   이 메시지를 보낸 WebSocket 객체 (바이낸스 연결)
         * @param data 수신된 텍스트 데이터 조각 (CharSequence = String과 유사)
         * @param last 이 조각이 메시지의 마지막 조각인지 여부
         *             true  = 전체 메시지 완성됨
         *             false = 아직 더 올 조각이 있음
         *
         * @return CompletionStage<?> = Java의 비동기 처리 결과 타입
         *         null 반환 = 특별한 후처리 없음 (프레임워크가 기본 처리)
         *
         * 처리 로직:
         *   1. buffer에 조각 추가
         *   2. last=true면 전체 메시지 완성 → 처리
         *   3. 세션이 있을 때만 브로드캐스트 (없으면 생략 = 최적화)
         *   4. buffer 초기화 (다음 메시지를 위해)
         *   5. ws.request(1) = "다음 메시지 1개를 받을 준비됐다"고 바이낸스에 알림
         *
         * ws.request(1) - backpressure 처리:
         *   Java WebSocket 클라이언트는 flow control 방식.
         *   메시지를 1개 받은 후, request(1)을 호출해야 다음 메시지를 받을 수 있음.
         *   이를 안 하면 메시지가 더 이상 오지 않음 (중요!)
         *   jQuery: $.ajax는 매번 새 요청을 보내므로 이런 개념이 없음.
         */
        @Override
        public CompletionStage<?> onText(java.net.http.WebSocket ws, CharSequence data, boolean last) {
            buffer.append(data);
            if (last) {
                // 세션이 있을 때만 브로드캐스트 (불필요한 작업 방지)
                if (handler.getSessionCount() > 0) {
                    handler.broadcastPrice(buffer.toString());
                }
                // 다음 메시지를 위해 buffer 초기화
                // buffer.setLength(0) = new StringBuilder() 보다 효율적 (객체 재사용)
                buffer.setLength(0);
            }
            // 다음 메시지 수신 요청 (이 호출 없으면 메시지가 더 오지 않음)
            ws.request(1);
            return null;
        }

        /**
         * onClose: 바이낸스 서버가 WebSocket 연결을 종료했을 때 호출.
         *
         * @param ws         종료된 WebSocket 객체
         * @param statusCode 종료 코드 (1000=정상, 1001=going away, 1006=비정상 등)
         * @param reason     종료 이유 메시지 (선택적)
         *
         * 처리: 자동 재연결 예약.
         * 종료 원인: 바이낸스 서버 점검, 네트워크 문제, 연결 타임아웃 등.
         *
         * @return null = 추가 처리 없음
         */
        @Override
        public CompletionStage<?> onClose(java.net.http.WebSocket ws, int statusCode, String reason) {
            log.warn("[BinanceStream] 연결 종료 (generation={}, status={}): {}", generation, statusCode, reason);
            // 세대가 일치할 때만 재연결 — 심볼 변경으로 이미 새 연결이 시작됐다면 무시
            if (generation == connectionGeneration) {
                scheduleReconnect();
            } else {
                log.info("[BinanceStream] 구 연결 종료 무시 (generation={}, current={})", generation, connectionGeneration);
            }
            return null;
        }

        /**
         * onError: 바이낸스 WebSocket 통신 중 오류 발생 시 호출.
         *
         * @param ws    오류가 발생한 WebSocket 객체
         * @param error 발생한 예외 (Throwable = Exception의 상위 타입)
         *
         * 처리:
         *   1. 오류 로그 기록
         *   2. NotificationService로 알림 발송 (현재는 로그 출력)
         *   3. 재연결 예약
         *
         * onError 발생 시 onClose도 이어서 호출되므로
         * scheduleReconnect()가 중복 호출될 수 있으나,
         * scheduler.schedule은 같은 지연 시간이면 실제로 2개 예약됨.
         * 실용적으로는 문제없음 (2번 재연결 시도해도 첫 번째에서 성공하면 끝).
         */
        @Override
        public void onError(java.net.http.WebSocket ws, Throwable error) {
            log.error("[BinanceStream] 스트림 오류 (generation={}): {}", generation, error.getMessage());
            // 세대가 일치할 때만 알림 및 재연결
            if (generation == connectionGeneration) {
                notificationService.sendAlert("[BinanceStream] 오류: " + error.getMessage());
                scheduleReconnect();
            } else {
                log.info("[BinanceStream] 구 연결 오류 무시 (generation={}, current={})", generation, connectionGeneration);
            }
        }
    }
}
