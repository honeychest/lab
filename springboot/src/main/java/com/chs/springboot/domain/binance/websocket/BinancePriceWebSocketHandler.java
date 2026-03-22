// [AGENT] 역할: 프론트엔드 바이낸스 WS 세션 관리 및 시세 브로드캐스트 허브 | 연관파일: BinanceStreamService.java(broadcastPrice 호출자), SymbolChangeEvent.java, WebSocketConfig.java | 주요메서드: afterConnectionEstablished(), afterConnectionClosed(), handleTransportError(), broadcastPrice(), getSessionCount() | ConcurrentWebSocketSessionDecorator로 동시 송신 직렬화
// Purpose: 프론트엔드 WebSocket 세션 관리 — 연결/해제 처리 및 시세 브로드캐스트

/**
 * ─────────────────────────────────────────────────────────────────
 *  이 클래스의 역할 (중계 허브)
 * ─────────────────────────────────────────────────────────────────
 *  비유: 채팅 서버의 채팅방 관리자
 *
 *  1. 브라우저(프론트엔드)가 /ws/binance-price 에 접속하면 세션 등록
 *  2. 브라우저가 탭을 닫거나 연결이 끊기면 세션 제거
 *  3. BinanceStreamService가 바이낸스에서 새 시세를 받아오면
 *     이 클래스의 broadcastPrice()를 호출 → 등록된 모든 세션에 전송
 *
 *  전체 데이터 흐름:
 *    [Binance.com] → [BinanceStreamService] → [BinancePriceWebSocketHandler]
 *                                                        ↓ broadcastPrice()
 *                                            [브라우저 세션 1] [세션 2] [세션 3]
 *
 *  jQuery 비유:
 *    마치 $.ajax success 콜백에서 받은 데이터를
 *    $('[data-target]').each(function() { $(this).text(data.price); }) 로
 *    여러 DOM 요소에 동시에 반영하는 것처럼,
 *    여기서는 연결된 모든 WebSocket 세션에 동시에 전송.
 * ─────────────────────────────────────────────────────────────────
 */
package com.chs.springboot.domain.binance.websocket;

import com.chs.springboot.domain.binance.model.event.SymbolChangeEvent;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.ConcurrentWebSocketSessionDecorator;
import org.springframework.web.socket.handler.TextWebSocketHandler;
import org.springframework.web.util.UriComponentsBuilder;

import java.util.concurrent.ConcurrentHashMap;

/**
 * @Component:
 *   Spring이 이 클래스의 인스턴스를 1개 생성(싱글턴)하고 관리함.
 *   다른 클래스에서 @Autowired 또는 생성자 주입으로 사용 가능.
 *   BinanceStreamService와 WebSocketConfig에서 주입받아 사용.
 *
 * extends TextWebSocketHandler:
 *   Spring WebSocket 라이브러리 제공 기본 클래스.
 *   텍스트 메시지만 처리하는 WebSocket 핸들러.
 *   WebSocketHandler 인터페이스를 구현한 편의 클래스로,
 *   필요한 메서드만 오버라이드하면 됨.
 *
 *   만약 바이너리(이미지, 파일 등)도 처리하려면 BinaryWebSocketHandler 사용.
 *   바이낸스는 JSON 텍스트를 보내므로 TextWebSocketHandler로 충분.
 */
@Component
public class BinancePriceWebSocketHandler extends TextWebSocketHandler {

    // 이전 코드에서는 Setter를 통해 BinanceStreamService를 주입받아
    // 순환 의존성이 발생했습니다. 이를 해결하기 위해 현재는 서비스
    // 의존성을 제거하고 ApplicationEventPublisher를 사용합니다.

    private final org.springframework.context.ApplicationEventPublisher eventPublisher;

    public BinancePriceWebSocketHandler(org.springframework.context.ApplicationEventPublisher eventPublisher) {
        this.eventPublisher = eventPublisher;
    }

    /**
     * Logger: 콘솔/파일에 로그를 기록하는 객체.
     * System.out.println 대신 SLF4J Logger를 사용하는 이유:
     *   - 로그 레벨 (DEBUG < INFO < WARN < ERROR) 로 제어 가능
     *   - 운영 환경에서 DEBUG 로그를 끄는 등 유연한 설정
     *   - 파일 로그, 로그 집계 시스템과 연동 용이
     *
     * LoggerFactory.getLogger(이 클래스.class):
     *   이 클래스 이름으로 Logger 인스턴스 생성.
     *   로그 출력 시 "[BinancePriceWebSocketHandler]" 처럼 클래스명이 표시됨.
     *
     * static final: 클래스 레벨에서 1개만 생성 (인스턴스마다 만들 필요 없음)
     */
    private static final Logger log = LoggerFactory.getLogger(BinancePriceWebSocketHandler.class);

    /**
     * sessions: 현재 연결된 모든 프론트엔드 WebSocket 세션을 보관하는 맵.
     *
     * ConcurrentHashMap<String, WebSocketSession>:
     *   - String = 세션 ID (각 브라우저 탭마다 고유한 ID 자동 생성)
     *   - WebSocketSession = Spring이 관리하는 WebSocket 연결 객체
     *
     *   왜 HashMap이 아닌 ConcurrentHashMap인가?
     *     - broadcastPrice()는 BinanceStreamService 스레드에서 호출
     *     - afterConnectionEstablished/Closed는 WebSocket 스레드에서 호출
     *     - 즉, 여러 스레드가 동시에 이 맵을 읽고/씀 → 동시성 문제 발생
     *
     *     일반 HashMap으로 멀티스레드 접근 시:
     *       - ConcurrentModificationException (순회 중 다른 스레드가 추가/삭제)
     *       - 데이터 손상 가능
     *
     *     ConcurrentHashMap은 내부적으로 락(lock)을 사용해 스레드 안전 보장.
     *     jQuery 비유: $.ajaxSetup이나 전역 변수를 여러 AJAX 콜백이 동시에
     *     수정할 때 충돌이 생기는 것을 방지하는 동기화 메커니즘.
     */
    private final ConcurrentHashMap<String, WebSocketSession> sessions = new ConcurrentHashMap<>();

    /**
     * afterConnectionEstablished: 프론트엔드 브라우저가 /ws/binance-price 에
     * WebSocket 연결을 완료했을 때 Spring이 자동으로 호출.
     *
     * @param session 새로 연결된 WebSocket 세션 객체
     *   session.getId() = 이 연결의 고유 ID (UUID 형태)
     *     예: "1", "2" 또는 "abc123-..." 형태
     *   session.getRemoteAddress() = 클라이언트 IP
     *   session.isOpen() = 연결 열림 여부
     *   session.sendMessage() = 클라이언트에 메시지 전송
     *
     * 동작:
     *   세션 ID를 key, 세션 객체를 value로 맵에 저장.
     *   jQuery: var sessions = {}; sessions[id] = sessionObj; 와 동일.
     */
    @Override
    public void afterConnectionEstablished(WebSocketSession session) {
        /**
         * ConcurrentWebSocketSessionDecorator 로 세션을 감싸서 저장.
         *
         * 문제 상황:
         *   바이낸스 내부 Worker 스레드가 여러 개(Worker-76, 84, 87...)라서
         *   broadcastPrice()가 거의 동시에 여러 스레드에서 호출됨.
         *   WebSocketSession.sendMessage()는 스레드 안전하지 않아서
         *   "TEXT_PARTIAL_WRITING" 오류가 발생하며 세션이 강제 종료됨.
         *
         * 해결:
         *   ConcurrentWebSocketSessionDecorator가 내부 큐로 전송을 직렬화.
         *   여러 스레드에서 동시에 sendMessage()를 호출해도 하나씩 순서대로 처리.
         *
         * 파라미터:
         *   session     → 원본 세션
         *   5000        → 전송 타임아웃 5000ms (초과 시 세션 강제 종료)
         *   64 * 1024   → 버퍼 최대 64KB (초과 시 세션 강제 종료)
         */
        WebSocketSession safeSession = new ConcurrentWebSocketSessionDecorator(session, 5000, 64 * 1024);
        sessions.put(session.getId(), safeSession);
        log.info("[WS] 클라이언트 연결: {} (총 {}개)", session.getId(), sessions.size());

        // 접속 URL의 쿼리 파라미터에서 symbol 추출
        // 예: ws://localhost:8080/ws/binance-price?symbol=ETHUSDT
        String symbol = UriComponentsBuilder.fromUri(session.getUri())
                .build()
                .getQueryParams()
                .getFirst("symbol");
        if (symbol != null && !symbol.isBlank()) {
            log.info("[WS] 클라이언트 {} 요청 심볼: {}", session.getId(), symbol);
            // 이벤트 발행: Service가 이를 수신해 자체적으로 심볼을 변경한다.
            eventPublisher.publishEvent(new SymbolChangeEvent(this, symbol));
        }
    }

    /**
     * afterConnectionClosed: 프론트엔드 브라우저의 WebSocket 연결이 종료될 때 호출.
     *
     * 종료 원인 예시:
     *   - 브라우저 탭 닫기
     *   - useBinanceWebSocket.ts에서 ws.close() 호출 (탭 비활성화, 언마운트)
     *   - 네트워크 단절 후 타임아웃
     *
     * @param session 종료된 WebSocket 세션
     * @param status 종료 상태 코드 (정상=1000, 비정상=각종 코드)
     *   CloseStatus.NORMAL = 정상 종료 (1000)
     *   CloseStatus.SERVER_ERROR = 서버 오류 (1011)
     *
     * 동작:
     *   세션 ID로 맵에서 제거.
     *   jQuery: delete sessions[id]; 와 동일.
     */
    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
        sessions.remove(session.getId());
        log.info("[WS] 클라이언트 해제: {} (총 {}개)", session.getId(), sessions.size());
    }

    /**
     * handleTransportError: WebSocket 전송 중 오류 발생 시 호출.
     *
     * 발생 상황:
     *   - 네트워크 갑작스러운 단절 (클라이언트가 close를 보내지 못한 경우)
     *   - 소켓 IO 예외
     *
     * @param session 오류가 발생한 세션
     * @param exception 발생한 예외
     *
     * 동작:
     *   1. 오류 로그 기록
     *   2. 세션 맵에서 제거 (더 이상 메시지 전송 시도 안 함)
     *   3. 세션 강제 종료 (이미 닫혀있을 수 있으므로 try-catch로 무시)
     *
     * 주의: 이 메서드 호출 후 afterConnectionClosed가 이어서 호출될 수도 있음.
     *   sessions.remove를 두 번 호출하더라도 ConcurrentHashMap은 안전하게 처리.
     */
    @Override
    public void handleTransportError(WebSocketSession session, Throwable exception) {
        log.error("[WS] 전송 오류 ({}): {}", session.getId(), exception.getMessage());
        sessions.remove(session.getId());
        try { session.close(); } catch (Exception e) { /* 이미 닫혀있을 경우 무시 */ }
    }

    /**
     * broadcastPrice: 연결된 모든 프론트엔드 클라이언트에게 시세 JSON을 전송.
     *
     * 호출자: BinanceStreamService.BinanceListener.onText()
     *   바이낸스에서 새 시세가 올 때마다 호출됨 (초당 약 1회).
     *
     * @param json 바이낸스에서 받은 원본 JSON 문자열 그대로 전달.
     *   예: '{"e":"24hrTicker","s":"BTCUSDT","c":"42000.00",...}'
     *   가공 없이 그대로 브로드캐스트 (성능 최적화: 파싱/재직렬화 불필요)
     *
     * 동작 흐름:
     *   1. sessions.forEach()로 모든 세션 순회
     *      jQuery: $.each(sessions, function(id, session) {...}) 와 동일
     *   2. 각 세션이 열려있으면 (isOpen()) TextMessage로 JSON 전송
     *   3. 세션이 닫혀있으면 맵에서 제거 (지연 정리)
     *   4. 전송 중 예외 발생 시 오류 로그 + 세션 제거
     *
     * TextMessage(json):
     *   Spring WebSocket의 텍스트 메시지 래퍼 객체.
     *   session.sendMessage(new TextMessage(json)) = 클라이언트에 JSON 문자열 전송.
     *   클라이언트의 ws.onmessage 이벤트가 발생하고 e.data에 json이 담겨옴.
     *
     * sessions.forEach()는 ConcurrentHashMap의 스레드 안전 순회.
     * 순회 중 다른 스레드가 세션을 추가/제거해도 예외가 발생하지 않음.
     */
    public void broadcastPrice(String json) {
        sessions.forEach((id, session) -> {
            try {
                if (session.isOpen()) {
                    session.sendMessage(new TextMessage(json));
                } else {
                    // isOpen()=false인 세션은 이미 닫혔으나 afterConnectionClosed가 아직 안 불린 것
                    // 지연 정리: 맵에서 제거
                    sessions.remove(id);
                }
            } catch (Exception e) {
                log.error("[WS] 메시지 전송 실패 ({}): {}", id, e.getMessage());
                sessions.remove(id);
            }
        });
    }

    /**
     * getSessionCount: 현재 연결된 클라이언트 수 반환.
     *
     * 호출자: BinanceStreamService.BinanceListener.onText()
     *   세션이 0개일 때 broadcastPrice를 호출하지 않기 위한 최적화.
     *   보는 사람이 없으면 메시지 전송 자체를 건너뜀.
     *   jQuery 비유: if ($('.live-ticker').length > 0) { 업데이트(); }
     *
     * @return 현재 연결된 WebSocket 세션 수 (0 = 아무도 보고 있지 않음)
     */
    public int getSessionCount() {
        return sessions.size();
    }
}
