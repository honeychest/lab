// [AGENT] 바이낸스 WebSocket 훅 — BTC/USDT 실시간 시세, 자동 재연결, 탭 비활성화 처리
// 연관: BinanceTicker.tsx, BinancePage.jsx
// Purpose: 바이낸스 BTC/USDT 실시간 시세 WebSocket 연결 훅 — 자동 재연결, 탭 비활성화 처리 포함

/**
 * ─────────────────────────────────────────────────────────────────
 *  동작 원리 (jQuery AJAX 경험자 기준 설명)
 * ─────────────────────────────────────────────────────────────────
 *  기존 AJAX 방식:
 *    $.ajax({ url: '/api/price' }) → 요청 1번 → 응답 1번 → 연결 끊김
 *    실시간 시세를 얻으려면 setInterval로 계속 반복 호출해야 함 (비효율)
 *
 *  WebSocket 방식:
 *    new WebSocket(url) → 한 번 연결 → 서버가 데이터를 push → 연결 유지
 *    마치 jQuery $.ajax를 한 번 열어두면 서버가 알아서 계속 데이터를 보내주는 개념
 *    브라우저 ↔ 서버 간 양방향 실시간 통신 프로토콜 (HTTP 업그레이드)
 *
 *  데이터 흐름:
 *    [Binance.com WS] → [Spring Boot BinanceStreamService]
 *                    → [BinancePriceWebSocketHandler]
 *                    → [프론트 useBinanceWebSocket (이 파일)]
 *                    → [BinanceTicker 컴포넌트에 표시]
 * ─────────────────────────────────────────────────────────────────
 */

import { useEffect, useRef, useState } from 'react';

// ─────────────────────────────────────────────────────────────────
//  타입 정의 (TypeScript Interface)
//  - jQuery에서 $.ajax 성공 콜백에 data 파라미터가 어떤 구조인지
//    미리 선언하는 것과 같은 역할
// ─────────────────────────────────────────────────────────────────

/**
 * 바이낸스 WebSocket ticker 이벤트 1개 페이로드 (24시간 롤링 통계)
 *
 * 바이낸스 공식 문서 스트림: wss://stream.binance.com:9443/ws/btcusdt@ticker
 * 실제 JSON 예시:
 * {
 *   "e": "24hrTicker",  ← 이벤트 타입
 *   "E": 123456789,     ← 이벤트 발생 타임스탬프 (Unix ms)
 *   "s": "BTCUSDT",     ← 심볼명
 *   "c": "42000.00",    ← 현재가 (close price)
 *   ...
 * }
 *
 * 모든 가격 필드는 문자열(string)로 옵니다.
 * 이유: JavaScript Number로는 소수점 이하 정밀도 손실이 생기므로
 *       바이낸스가 의도적으로 string으로 전송함.
 *       화면 표시 시 parseFloat() 또는 Number() 변환 필요.
 */
export interface BinanceTicker {
    /** 이벤트 타입 문자열. 항상 "24hrTicker" */
    e: string;

    /** 이벤트 발생 시각 (Unix 타임스탬프, 밀리초 단위)
     *  JavaScript: new Date(ticker.E) 으로 Date 객체 변환 가능 */
    E: number;

    /** 거래 심볼. 예: "BTCUSDT" */
    s: string;

    /** 가격 변동량 (24시간 전 대비 현재가 차이, 문자열)
     *  예: "150.00" = +150 USDT, "-200.00" = -200 USDT */
    p: string;

    /** 가격 변동률 (%, 문자열)
     *  예: "0.357" = +0.357%, "-0.5" = -0.5% */
    P: string;

    /** 가중 평균가 (Weighted Average Price, 24시간 기준, 문자열) */
    w: string;

    /** 이전 종가 (어제 종가 기준, 문자열) */
    x: string;

    /** 현재가 (Last Price, 문자열)
     *  화면에 크게 표시되는 핵심 가격
     *  parseFloat(ticker.c) 로 숫자 변환 후 toLocaleString() 등 사용 */
    c: string;

    /** 마지막 체결 수량 (Last Quantity, BTC 단위, 문자열) */
    Q: string;

    /** 최우선 매수호가 (Bid Price = 내가 팔 때 받을 수 있는 가격, 문자열) */
    b: string;

    /** 매수호가 수량 (Bid Quantity, BTC 단위, 문자열) */
    B: string;

    /** 최우선 매도호가 (Ask Price = 내가 살 때 지불해야 하는 가격, 문자열) */
    a: string;

    /** 매도호가 수량 (Ask Quantity, BTC 단위, 문자열) */
    A: string;

    /** 시가 (Open Price = 24시간 전 첫 체결가, 문자열) */
    o: string;

    /** 고가 (High Price = 24시간 최고가, 문자열) */
    h: string;

    /** 저가 (Low Price = 24시간 최저가, 문자열) */
    l: string;

    /** 거래량 (Volume = 24시간 BTC 거래량, 문자열)
     *  BTC 수량 기준. 예: "12345.678" = 12,345 BTC 거래됨 */
    v: string;

    /** 거래대금 (Quote Volume = 24시간 USDT 거래대금, 문자열)
     *  USDT 금액 기준. v × 평균가 ≈ q */
    q: string;

    /** 통계 시작 시각 (Open Time, Unix ms, 숫자) */
    O: number;

    /** 통계 종료 시각 (Close Time, Unix ms, 숫자) */
    C: number;

    /** 첫 번째 체결 ID (First Trade ID) */
    F: number;

    /** 마지막 체결 ID (Last Trade ID) */
    L: number;

    /** 총 체결 횟수 (Number of Trades, 숫자)
     *  24시간 동안 총 거래가 몇 번 발생했는지 */
    n: number;
}

/**
 * WebSocket 연결 상태 타입 (유니온 타입)
 *
 * TypeScript 유니온 타입: 이 세 가지 문자열 중 하나만 가능하다고 명시
 * jQuery에서 비유하자면 $.ajax의 status: 'beforeSend' | 'success' | 'error' 같은 개념
 *
 * - 'connecting' : 소켓 생성 직후, 아직 연결이 완료되지 않은 상태 (주황 표시)
 * - 'connected'  : onopen 이벤트 발생, 서버와 연결 완료 (초록 LIVE 표시)
 * - 'disconnected': onclose/onerror 발생, 연결이 끊긴 상태 (빨간 표시)
 */
export type WsStatus = 'connecting' | 'connected' | 'disconnected';

/**
 * 이 훅이 반환하는 객체의 타입
 *
 * 컴포넌트에서 const { ticker, status } = useBinanceWebSocket(); 로 구조분해할 때
 * 각 값의 타입이 자동으로 추론됨
 */
export interface UseBinanceWebSocketResult {
    /** 바이낸스에서 받은 마지막 ticker 데이터. 첫 수신 전에는 null */
    ticker: BinanceTicker | null;
    /** 현재 WebSocket 연결 상태 */
    status: WsStatus;
}

// ─────────────────────────────────────────────────────────────────
//  커스텀 훅 본체
// ─────────────────────────────────────────────────────────────────

/**
 * useBinanceWebSocket
 *
 * 사용법 (컴포넌트에서):
 *   const { ticker, status } = useBinanceWebSocket('BTCUSDT');
 *   또는
 *   const { ticker, status } = useBinanceWebSocket('ETHUSDT');
 *
 * @param selectedSymbol 구독할 코인 심볼 (예: 'BTCUSDT', 'ETHUSDT')
 *   - 이 값이 변경되면 자동으로 기존 WebSocket을 종료하고 새 심볼로 재연결
 *   - jQuery 플러그인으로 비유하면, 옵션 변경 시 플러그인을 destroy()했다가 새 옵션으로 재초기화하는 것과 유사
 *
 * React Custom Hook 개념:
 *   - 'use'로 시작하는 함수
 *   - useState, useRef, useEffect 같은 React 내장 훅을 조합한 재사용 가능한 로직
 *   - jQuery 플러그인을 $.fn에 등록해서 재사용하는 것과 유사한 개념
 */
export function useBinanceWebSocket(selectedSymbol: string): UseBinanceWebSocketResult {

    // ── State (화면 갱신을 트리거하는 반응형 변수) ──────────────────
    //
    // useState: jQuery에서 변수 값이 바뀌면 수동으로 DOM을 업데이트했던 것처럼,
    //           React에서는 setState를 호출하면 자동으로 화면이 다시 그려짐.
    //
    // ticker: 바이낸스에서 받은 최신 시세 데이터. 처음엔 null (아직 데이터 없음)
    const [ticker, setTicker] = useState<BinanceTicker | null>(null);

    // status: 현재 WebSocket 연결 상태. 기본값은 'connecting' (훅이 마운트되면 즉시 연결 시도)
    const [status, setStatus] = useState<WsStatus>('connecting');

    // ── Ref (화면 갱신 없이 값을 보관하는 변수) ─────────────────────
    //
    // useRef: jQuery에서 var myVar = null; 로 클로저에 보관하는 변수와 유사.
    //         값이 바뀌어도 컴포넌트가 리렌더링(화면 재그리기)되지 않음.
    //         주로 "화면에 보여줄 필요는 없지만 로직에서 참조해야 하는 값" 에 사용.
    //
    // wsRef: 현재 열려있는 WebSocket 객체를 보관. reconnect 시 기존 소켓 닫을 때 참조.
    const wsRef = useRef<WebSocket | null>(null);

    // reconnectTimerRef: setTimeout으로 만든 타이머 ID 보관.
    //   jQuery에서 var timerId = setTimeout(fn, 3000); 으로 보관하는 것과 동일.
    //   클린업(컴포넌트 제거)시 clearTimeout으로 타이머 취소에 사용.
    const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // isManualClose: "내가 직접 close() 호출한 것인지" 를 구분하는 플래그.
    //   true  → 의도적으로 닫은 것이므로 자동 재연결 하지 않음
    //   false → 네트워크 문제 등으로 끊긴 것이므로 자동 재연결 시도
    const isManualClose = useRef<boolean>(false);

    // ── connect 함수 ────────────────────────────────────────────────
    /**
     * WebSocket 연결을 생성하고 이벤트 핸들러를 등록하는 함수.
     *
     * jQuery AJAX와 비교:
     *   $.ajax({ url, success, error }) 와 비슷하게
     *   new WebSocket(url) 생성 후 각 이벤트(onopen, onmessage, onclose, onerror) 등록
     *
     * 이 함수는 아래 상황에서 호출됨:
     *   1. 컴포넌트 최초 마운트 시
     *   2. WebSocket이 비정상 종료된 후 3초 뒤 자동 재연결 시
     *   3. 탭을 다시 활성화(visibility = visible)했을 때
     */
    const connect = () => {
        // ── 중복 연결 방지 ──────────────────────────────────────────
        //
        // WebSocket readyState 값 (브라우저 표준):
        //   WebSocket.CONNECTING = 0 → 연결 중 (new WebSocket() 직후)
        //   WebSocket.OPEN       = 1 → 연결 완료 (데이터 송수신 가능)
        //   WebSocket.CLOSING    = 2 → 닫히는 중 (close() 호출 후)
        //   WebSocket.CLOSED     = 3 → 완전히 닫힘
        //
        // CONNECTING(0) 또는 OPEN(1) 상태면 이미 연결이 있으므로 새로 만들지 않음.
        // 이 체크가 없으면 connect()가 여러 번 호출될 때 소켓이 여러 개 생겨서
        // 메모리 누수 + 중복 메시지 수신 문제가 발생함.
        const state = wsRef.current?.readyState;
        if (state === WebSocket.CONNECTING || state === WebSocket.OPEN) return;

        // 연결 시도 시작 → 상태를 'connecting'으로 업데이트 (주황 인디케이터)
        setStatus('connecting');

        // ── WebSocket URL 동적 생성 ─────────────────────────────────
        //
        // HTTP  접속 중이면 → ws://  프로토콜 사용
        // HTTPS 접속 중이면 → wss:// 프로토콜 사용 (SSL WebSocket, 필수)
        //
        // window.location.host = 현재 브라우저 주소창의 호스트:포트
        //   예: 개발 환경 → "localhost:5173"
        //   예: 운영 환경 → "mysite.com"
        //
        // vite.config.js의 proxy 설정 덕분에:
        //   ws://localhost:5173/ws/binance-price?symbol=BTCUSDT
        //   → ws://localhost:8080/ws/binance-price?symbol=BTCUSDT  (Spring Boot 서버)
        //   로 자동 프록시됨. jQuery에서 $.ajax url을 상대경로로 쓰는 것과 같은 개념.
        //
        // ⭐ 쿼리 파라미터로 selectedSymbol 전달:
        //   - selectedSymbol이 'BTCUSDT' 또는 'ETHUSDT' 등으로 변경되면
        //   - 백엔드는 이 파라미터를 읽어 해당 심볼의 Binance WebSocket을 구독
        //   - 비유: $.ajax({ url: '/api/price?symbol=ETHUSDT' }) 처럼 쿼리 파라미터 사용
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        // Vite 프록시 경유: window.location.host (포트 포함, 예: 121.170.210.60:5173)
        // 브라우저 → ws://[host]/ws/binance-price → Vite 프록시 → ws://localhost:8080/ws/binance-price
        // 네트워크 IP(공인 IP 등)로 접속해도 프록시가 서버 내부에서 localhost로 포워딩하므로
        // Hairpin NAT 문제 없이 동작함.
        const host = window.location.host;
        const url = `${protocol}//${host}/ws/binance-price?symbol=${selectedSymbol}`;
        console.log('[useBinanceWebSocket] 연결 시도 URL:', url); // debug
        const ws = new WebSocket(url);

        // ── 이벤트 핸들러 등록 ──────────────────────────────────────
        //
        // jQuery의 .on('click', fn) 처럼 WebSocket도 각 이벤트에 함수를 등록.

        /**
         * onopen: 서버와 WebSocket 핸드쉐이크 완료 시 발생.
         * jQuery $.ajax의 beforeSend 이후 서버 응답이 200 OK 온 순간과 유사.
         * 이 시점부터 메시지를 수신할 수 있음.
         */
        ws.onopen = () => setStatus('connected');

        /**
         * onmessage: 서버에서 데이터를 push할 때마다 발생.
         * jQuery에서 polling 방식으로 계속 $.ajax 호출하던 것을
         * 서버가 알아서 새 데이터가 있을 때마다 이 이벤트로 보내줌.
         *
         * e.data: 서버가 보낸 raw 문자열 (JSON 형태)
         *   예: '{"e":"24hrTicker","s":"BTCUSDT","c":"42000.00",...}'
         *
         * JSON.parse(): jQuery에서 $.parseJSON() 또는 JSON.parse()로
         *               문자열을 객체로 변환하는 것과 동일.
         *
         * try-catch: JSON이 깨진 경우(네트워크 오류 등) 파싱 실패해도
         *            앱이 죽지 않도록 방어.
         */
        ws.onmessage = (e: MessageEvent) => {
            try {
                setTicker(JSON.parse(e.data) as BinanceTicker);
            } catch {
                // 파싱 실패 시 무시 (불완전한 데이터는 버림)
            }
        };

        /**
         * onclose: WebSocket 연결이 종료될 때 발생.
         * 원인: 서버 재시작, 네트워크 단절, 명시적 close() 호출 등
         *
         * isManualClose.current 체크:
         *   - true  = 내가 직접 close() 호출한 것 → 재연결 하지 않음
         *   - false = 예기치 않은 종료 → 3초 후 자동 재연결
         *
         * setTimeout 3000ms = jQuery setInterval처럼 일정 시간 후 재시도,
         *   단 이 경우는 1회성 타이머 (setInterval 대신 setTimeout 재귀 방식).
         */
        ws.onclose = () => {
            setStatus('disconnected');
            if (!isManualClose.current) {
                reconnectTimerRef.current = setTimeout(connect, 3000);
            }
        };

        /**
         * onerror: WebSocket 오류 발생 시 콜백.
         * jQuery $.ajax의 error 콜백과 유사.
         *
         * 중요: onerror 직후에는 항상 onclose도 발생함.
         *       따라서 재연결 로직은 onclose에서만 처리하고
         *       여기서는 로그만 남김.
         * ws.close()를 명시 호출하면 onclose가 트리거되어 재연결 로직이 실행됨.
         */
        ws.onerror = (e: Event) => {
            console.error('[WS] 오류:', e);
            ws.close();
        };

        // 새로 만든 소켓을 ref에 저장 (나중에 close() 호출 시 참조)
        wsRef.current = ws;
    };

    // ── useEffect: 컴포넌트 생명주기 관리 ───────────────────────────
    /**
     * useEffect(() => { ... }, [])
     *
     * jQuery 비유:
     *   $(document).ready(function() { ... }) 와 유사하게,
     *   컴포넌트가 DOM에 마운트된 직후 1회 실행됨.
     *
     * 두 번째 인자 [] (빈 배열) = 의존성 없음 = 마운트 시 1번만 실행.
     *   만약 [someVar]를 넣으면 someVar가 바뀔 때마다 재실행.
     *
     * ⚠ React 18 StrictMode 주의사항:
     *   개발 환경에서 StrictMode는 버그를 일찍 발견하기 위해
     *   useEffect를 "마운트 → 클린업 → 재마운트" 순으로 2번 실행함.
     *   이 때문에 첫 번째 마운트의 클린업에서 isManualClose=true 설정 후
     *   두 번째 마운트에서 초기화를 안 하면 재연결이 영구 차단됨.
     *   → 반드시 useEffect 시작 시 isManualClose.current = false 로 초기화.
     */
    useEffect(() => {
        // 심볼 변경 시 이전 코인 데이터 즉시 초기화 → BinanceTicker가 스켈레톤 표시
        // 초기 마운트 시에는 이미 null이므로 시각적 변화 없음
        setTicker(null);

        // StrictMode 대응: 재마운트 시 수동 종료 플래그 초기화
        isManualClose.current = false;

        // 컴포넌트 마운트 시 WebSocket 연결 시작
        connect();

        // ── Page Visibility API ──────────────────────────────────────
        /**
         * visibilitychange 이벤트:
         *   브라우저 탭을 전환하거나 최소화할 때 발생하는 브라우저 표준 이벤트.
         *
         * document.hidden:
         *   true  = 탭이 백그라운드 (사용자가 다른 탭을 보고 있음)
         *   false = 탭이 포그라운드 (사용자가 이 탭을 보고 있음)
         *
         * 왜 이 처리가 필요한가?
         *   - 탭이 숨겨진 상태에서 WebSocket 연결을 유지하면 불필요한 네트워크 사용.
         *   - 모바일 브라우저는 백그라운드 탭의 WebSocket을 강제 종료하기도 함.
         *   - 탭을 오래 방치하면 서버의 heartbeat timeout으로 연결이 끊길 수 있음.
         *
         * jQuery 비유:
         *   $(document).on('visibilitychange', fn) 과 동일한 코드.
         */
        const handleVisibilityChange = () => {
            if (document.hidden) {
                // 탭 비활성화 → 의도적으로 WebSocket 종료 (자동 재연결 방지)
                isManualClose.current = true;
                // 기존 재연결 타이머가 있으면 취소 (3초 대기 중인 reconnect 방지)
                // jQuery: clearTimeout(timerId) 와 동일
                if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
                wsRef.current?.close(); // optional chaining: wsRef.current가 null이면 무시
                setStatus('disconnected');
            } else {
                // 탭 활성화 → 수동 종료 플래그 해제 후 재연결
                isManualClose.current = false;
                connect();
            }
        };

        // 이벤트 리스너 등록
        // jQuery: $(document).on('visibilitychange', handleVisibilityChange)
        document.addEventListener('visibilitychange', handleVisibilityChange);

        // ── 클린업 함수 (return 내부) ────────────────────────────────
        /**
         * useEffect의 return 함수 = 클린업(Cleanup) 함수
         *
         * 실행 시점:
         *   1. 컴포넌트가 DOM에서 제거(언마운트)될 때
         *   2. 의존성[selectedSymbol]이 변경될 때
         *   3. 개발 환경 StrictMode에서 재마운트 전 정리할 때
         *
         * jQuery 비유:
         *   $(window).on('beforeunload', fn) 처럼 정리 작업을 수행.
         *   또는 플러그인의 destroy() 메서드와 유사.
         *
         * 클린업을 안 하면:
         *   - 이벤트 리스너가 계속 쌓여서 메모리 누수 발생
         *   - 언마운트된 컴포넌트에 setState 호출 → React 경고 발생
         *   - 페이지 이동 후에도 WebSocket 재연결이 계속 시도됨
         */
        return () => {
            // 이벤트 리스너 제거 (등록한 것과 정확히 같은 함수 레퍼런스를 전달해야 함)
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            // 수동 종료 플래그 설정 → 클린업 중 onclose 발생 시 재연결 방지
            isManualClose.current = true;
            // 대기 중인 재연결 타이머 취소
            if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
            // 열려있는 WebSocket 정상 종료
            wsRef.current?.close();
        };
    }, [selectedSymbol]); // selectedSymbol 변경 시마다 재실행 (이전호출의 클린업 후 다시 연결)

    // ── 반환값 ──────────────────────────────────────────────────────
    // 컴포넌트에서 구조분해로 사용: const { ticker, status } = useBinanceWebSocket();
    return { ticker, status };
}
