// [AGENT] BinancePage — Binance 대시보드 컨테이너 컴포넌트
// 연관: BinanceTicker.tsx, BinanceTickerMobile.tsx, BinanceWallet.tsx
// 훅: useBinanceWebSocket.ts, useUpbitWebSocket.ts
// 주요기능: WebSocket 시세, Upbit KRW 환율, 지갑 잔고 REST, 패널 높이 고정(ref), 서버 오류 인라인 렌더
// Purpose: Binance 대시보드 페이지 — 실시간 WebSocket 시세 및 지갑 잔고 표시

/**
 * ─────────────────────────────────────────────────────────────────
 *  이 파일의 역할 (컨테이너 컴포넌트)
 * ─────────────────────────────────────────────────────────────────
 *  데이터를 가져오고 자식 컴포넌트에 나눠주는 "중간 관리자" 역할.
 *
 *  담당 업무:
 *    1. useBinanceWebSocket 훅을 사용해 실시간 시세 WebSocket 연결
 *    2. axios로 지갑 잔고 REST API 1회 호출
 *    3. 상태(status)에 따라 연결 상태 인디케이터 렌더링
 *    4. BinanceTicker, BinanceWallet 자식 컴포넌트에 데이터 전달
 *
 *  jQuery 비유:
 *    $(document).ready() 에서 $.ajax 호출 후
 *    결과를 각 $('#ticker'), $('#wallet') 에 채워주는 코드와 유사한 역할.
 *    단, React에서는 DOM을 직접 조작하지 않고 state로 관리함.
 * ─────────────────────────────────────────────────────────────────
 */

import { useEffect, useState, useRef, useMemo } from 'react';

/**
 * axios: jQuery의 $.ajax와 동일한 역할을 하는 HTTP 요청 라이브러리.
 * 차이점: Promise 기반, async/await과 자연스럽게 사용 가능.
 * $.ajax → $.ajax({ url, success, error })
 * axios  → axios.get(url).then(res => ...).catch(err => ...)
 *       또는 await axios.get(url) (async 함수 내에서)
 */
import axios from 'axios';

/**
 * Layout: 헤더+푸터를 감싸는 전체 페이지 레이아웃 컴포넌트.
 * footerCenter={[]} 로 하단 중앙 버튼 없이 표시.
 */
import Layout from '../../shared/ui/layout/Layout.jsx';
import ErrorPage from '../error/ErrorPage.tsx';

/**
 * useBinanceWebSocket: WebSocket 연결 로직을 담은 커스텀 훅.
 * 반환값: { ticker (최신 시세 데이터), status (연결 상태) }
 * 파일: frontend/src/hooks/useBinanceWebSocket.ts
 */
import { useBinanceWebSocket } from '../../domain/binance/model/hook/useBinanceWebSocket.ts';
import { useUpbitWebSocket } from '../../domain/binance/model/hook/useUpbitWebSocket.ts';

/**
 * BinanceTicker: 실시간 시세 UI 컴포넌트 (현재가, 변동률, 고저가 등)
 * 파일: frontend/src/features/binance/components/BinanceTicker.tsx
 */
import BinanceTicker from '../../domain/binance/ui/ticker/BinanceTicker.tsx';
import BinanceTickerMobile from '../../domain/binance/ui/ticker/BinanceTickerMobile.tsx';
import pageStyles from './BinancePage.module.css';

/**
 * BinanceWallet: 지갑 잔고 UI 컴포넌트 (보유 코인 목록)
 * 파일: frontend/src/features/binance/components/BinanceWallet.tsx
 */
import BinanceWallet from '../../domain/binance/ui/wallet/BinanceWallet.tsx';

// ─────────────────────────────────────────────────────────────────
//  연결 상태별 UI 설정
// ─────────────────────────────────────────────────────────────────

/**
 * STATUS_CONFIG: WebSocket 연결 상태(status)에 따른 UI 설정 맵.
 *
 * 컴포넌트 외부에 선언된 이유:
 *   - 이 객체는 절대 변하지 않는 상수임.
 *   - 컴포넌트 내부에 두면 렌더링마다 새 객체가 생성되어 불필요한 메모리 낭비.
 *   - jQuery에서 var CONFIG = {...}; 를 전역 스코프 또는 즉시실행함수 안에 한 번만 선언하는 것과 동일.
 *
 * 키: 'connected' | 'connecting' | 'disconnected' (WsStatus 타입과 매핑)
 * 값:
 *   color  - CSS 색상값 (인디케이터 점, 텍스트 색상에 사용)
 *   dot    - 애니메이션 글로우 효과 사용 여부 (연결됐을 때만 true)
 *   text   - 상태 표시 텍스트
 */
const STATUS_CONFIG = {
    connected:    { color: '#2ecc71', dot: true,  text: 'LIVE' },
    connecting:   { color: '#f39c12', dot: false, text: '연결 중...' },
    disconnected: { color: '#e74c3c', dot: false, text: '연결 끊김' },
};

/**
 * COINS: 상단 코인 선택 탭에 사용할 코인 목록.
 *
 *  - symbol: 바이낸스 심볼 (향후 실제 데이터 연동 시 사용 예정)
 *  - code:   탭에 표시할 짧은 코드 (예: BTC, ETH)
 *  - label:  상세 라벨 (예: "BTC / USDT") — BinanceTicker 헤더 등에 사용
 *  - upbitCode: 업비트 KRW 마켓 코드 (예: KRW-BTC). 미상장 코인은 null
 *
 * 지금은 WebSocket이 BTCUSDT만 구독하고 있어 두 탭 모두 같은 데이터를 보지만,
 * UI 구조를 먼저 잡아두고 나중에 백엔드/훅을 확장할 때 이 배열만 확장하면 되도록 설계.
 */
const COINS = [
    { symbol: 'BTCUSDT', code: 'BTC', label: 'BTC / USDT', upbitCode: 'KRW-BTC' },
    { symbol: 'ETHUSDT', code: 'ETH', label: 'ETH / USDT', upbitCode: 'KRW-ETH' },
    { symbol: 'SOLUSDT', code: 'SOL', label: 'SOL / USDT', upbitCode: 'KRW-SOL' },
    { symbol: 'XRPUSDT', code: 'XRP', label: 'XRP / USDT', upbitCode: 'KRW-XRP' },
];

// prefers-reduced-motion: 애니메이션 민감 사용자 대응 (모듈 레벨 1회 감지)
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// ─────────────────────────────────────────────────────────────────
//  컴포넌트 본체
// ─────────────────────────────────────────────────────────────────

function BinancePage() {
    // ── 선택된 코인 상태 ──────────────────────────────────────────
    /**
     * selectedSymbol:
     *   - 상단 탭에서 선택된 코인의 심볼 (예: 'BTCUSDT', 'ETHUSDT')
     */
    const [selectedSymbol, setSelectedSymbol] = useState(COINS[0].symbol);

    // ── WebSocket 훅 ─────────────────────────────────────────────
    /**
     * useBinanceWebSocket():
     *   커스텀 훅 호출. 이 한 줄로 WebSocket 연결 관리가 모두 처리됨.
     *   ticker: 최신 BTC/USDT 시세 데이터 (BinanceTicker 타입 또는 null)
     *   status: 연결 상태 문자열 ('connecting' | 'connected' | 'disconnected')
     *
     *   컴포넌트 마운트 시 자동 연결, 언마운트 시 자동 종료.
     *   탭 전환 시 자동 종료/재연결, 네트워크 끊김 시 자동 재연결.
     */
    const { ticker, status } = useBinanceWebSocket(selectedSymbol);

    // ── 지갑 잔고 State ──────────────────────────────────────────
    /**
     * accountInfo: REST API로 받아온 계좌 잔고 데이터.
     *   null = 아직 로딩 중 또는 에러 발생.
     *   BinanceWallet 컴포넌트에 props로 전달.
     */
    const [accountInfo, setAccountInfo]   = useState(null);

    /**
     * walletLoading: 지갑 잔고 API 호출 진행 중 여부.
     *   true  = 로딩 중 (스피너 표시)
     *   false = 완료 (성공 또는 실패)
     *   초기값이 true인 이유: 컴포넌트 마운트 직후 API 호출이 시작되므로
     *   처음부터 로딩 상태로 시작해야 깜빡임 없이 자연스러움.
     */
    const [walletLoading, setWalletLoading] = useState(true);

    /**
     * walletError: API 호출 실패 시 에러 메시지.
     *   null = 에러 없음 (정상)
     *   문자열 = 에러 발생 (BinanceWallet에서 에러 UI 표시)
     */
    const [walletError, setWalletError]   = useState(null);

    /**
     * serverError: 서버 다운 시 인라인으로 표시할 에러 코드.
     *   null    = 정상 상태
     *   '502'   = Nginx가 502를 가로채 HTML 반환 (백엔드 다운)
     *   '503'   = 네트워크 완전 단절
     *   '500' 등 = 기타 5xx 오류
     * navigate 대신 이 state를 세팅해 URL을 바꾸지 않고 ErrorPage를 인라인 렌더.
     */
    const [serverError, setServerError] = useState(null);


    // ── 지갑 잔고 REST API 호출 ──────────────────────────────────
    /**
     * useEffect(() => {...}, []):
     *   빈 배열 의존성 = 컴포넌트 마운트 시 1회만 실행.
     *   jQuery의 $(document).ready() 안에 $.ajax 호출하는 것과 동일한 타이밍.
     *
     *   왜 지갑은 WebSocket이 아닌 REST API인가?
     *   - 잔고는 실시간으로 변하지 않음 (거래 발생 시에만 변경)
     *   - WebSocket을 추가 연결하면 Binance Rate Limit 소비 불필요
     *   - 단순 1회 조회로 충분함
     */
    useEffect(() => {
        /**
         * async 함수를 useEffect 안에서 즉시 정의하고 호출하는 패턴.
         *
         * 왜 useEffect 자체를 async로 만들지 않나?
         *   React의 useEffect는 cleanup 함수(동기)를 반환해야 하는데,
         *   async 함수는 항상 Promise를 반환하므로 규격 위반.
         *   → 안에서 async 함수를 정의하고 즉시 호출하는 패턴으로 우회.
         *
         * jQuery 비유:
         *   $(document).ready(function() {
         *     $.ajax({ url: '/api/binance/account', success: function(data) {...} });
         *   });
         */
        const fetchWallet = async () => {
            try {
                /**
                 * axios.get('/api/binance/account'):
                 *   Spring Boot BinanceController의 GET /api/binance/account 호출.
                 *   vite.config.js 프록시 설정으로 /api → http://localhost:8080 으로 전달.
                 */
                const res = await axios.get('/api/binance/account');

                /**
                 * Nginx proxy_intercept_errors 대응:
                 *   백엔드 다운 시 Nginx가 502를 가로채 /50x.html을 200 OK + text/html로 반환.
                 *   axios는 200이므로 에러로 인식하지 않아 catch가 타지 않음.
                 *   → Content-Type이 application/json이 아니면 서버 다운으로 판단.
                 *   navigate 대신 setServerError로 URL을 유지하면서 에러 UI 표시.
                 */
                const contentType = res.headers['content-type'] || '';
                if (!contentType.includes('application/json')) {
                    setServerError('502');
                    return; // walletLoading=true 유지 → return null 상태 지속
                }

                setAccountInfo(res.data);
                setWalletLoading(false); // 성공 시에만 로딩 해제

            } catch (err) {
                /**
                 * catch: 네트워크 오류 또는 5xx 직접 응답 시 실행.
                 *
                 * status 없음: 네트워크 자체 단절 → 503으로 표시.
                 * status >= 500: 백엔드 오류.
                 * 4xx: 앱 레벨 오류 → 에러 메시지만 표시 후 로딩 해제.
                 *
                 * finally 미사용 이유:
                 *   서버 다운 케이스에서 setWalletLoading(false)가 실행되면
                 *   walletLoading=false → 페이지가 잠깐 렌더되어 헤더가 보이는 flash 발생.
                 *   → 서버 오류 시 walletLoading=true를 유지해 return null 상태를 지속.
                 */
                const status = err?.response?.status;
                if (!status || status >= 500) {
                    setServerError(String(status ?? 503));
                    return; // walletLoading=true 유지
                }
                // 4xx 오류 → 에러 메시지 표시
                setWalletError('잔고 조회에 실패했습니다.');
                setWalletLoading(false);
            }
        };

        fetchWallet(); // async 함수를 즉시 실행 (await 없이 호출)
    }, []); // 의존성 빈 배열 = 마운트 1회만

    // ── 상태 인디케이터 값 추출 ──────────────────────────────────
    /**
     * STATUS_CONFIG[status]:
     *   status가 'connected'이면 STATUS_CONFIG.connected 객체 반환.
     *   '?? STATUS_CONFIG.disconnected' = nullish coalescing 연산자.
     *   status가 undefined/null일 경우 기본값으로 disconnected 사용.
     *   jQuery에서 var cfg = STATUS_CONFIG[status] || STATUS_CONFIG.disconnected; 와 동일.
     *
     *   구조분해 할당:
     *   var obj = STATUS_CONFIG[status];
     *   var color = obj.color; var dot = obj.dot; var text = obj.text;
     *   위의 3줄을 한 줄로 줄인 것.
     */
    const { color, text } = STATUS_CONFIG[status] ?? STATUS_CONFIG.disconnected;

    // ── 현재 선택된 코인 정보 ─────────────────────────────────────
    /**
     * selectedCoin:
     *   - COINS 배열에서 현재 선택된 심볼에 해당하는 객체
     *   - 찾지 못하면 안전하게 첫 번째 코인(BTC)로 폴백
     *   - 헤더(좌측 티커 표시)와 BinanceTicker pairLabel에 함께 사용.
     */
    const selectedCoin = COINS.find((c) => c.symbol === selectedSymbol) ?? COINS[0];

    // ── Upbit WebSocket 훅 (KRW 실시간 시세 + KRW-USDT 환율 단일 소켓 통합) ──
    /**
     * 업비트 구독 코드 목록:
     *   - 선택 코인의 KRW 마켓(있으면) + KRW-USDT(항상) 를 하나의 소켓으로 동시 구독.
     *   - useMemo로 배열 참조를 고정해 불필요한 재연결을 방지.
     *
     * upbitTickers:
     *   - key: 업비트 코드 (예: 'KRW-BTC', 'KRW-USDT')
     *   - value: 해당 코드의 최신 trade_price 포함 티커 객체
     */
    const upbitCodes = useMemo(() => (
        selectedCoin.upbitCode
            ? [selectedCoin.upbitCode, 'KRW-USDT']
            : ['KRW-USDT']
    ), [selectedCoin.upbitCode]);

    const { tickers: upbitTickers } = useUpbitWebSocket(upbitCodes);

    /**
     * upbitTicker:
     *   - undefined: 업비트 미상장 코인 (KRW 블록 숨김)
     *   - null:      상장 코인이지만 아직 데이터 미수신
     *   - 객체:      수신 완료
     */
    const upbitTicker = selectedCoin.upbitCode
        ? upbitTickers[selectedCoin.upbitCode] ?? null
        : undefined;

    /**
     * usdtTicker:
     *   - KRW-USDT 수신 티커. 미수신이면 null.
     *   - BinanceTicker의 usdtKrwTicker props 형태를 유지하기 위해 분리.
     */
    const usdtTicker = upbitTickers['KRW-USDT'] ?? null;

    // ── 패널 높이 고정용 ref ─────────────────────────────────────
    /**
     * tickerWrapperRef: BinanceTicker를 감싸는 div에 연결된 DOM 참조.
     * savedHeightRef:   실데이터가 표시 중일 때 측정한 높이(px)를 보관.
     *
     * 동작 원리:
     *   1. ticker가 non-null(실데이터 표시 중) → DOM 높이를 측정해 savedHeightRef에 저장
     *   2. ticker가 null(스켈레톤 표시 중) → 래퍼 div에 minHeight를 적용해 패널 크기 고정
     *   3. ticker가 다시 non-null → minHeight 해제, 실데이터가 자연스럽게 높이를 결정
     *
     * useRef를 쓰는 이유:
     *   값 변경 시 리렌더링이 발생하지 않음 — 높이 저장은 부수 효과이므로 적합.
     */
    const tickerWrapperRef = useRef(null);
    const [savedHeight, setSavedHeight] = useState(null);

    // 모바일 전용 — PC 메커니즘과 완전히 분리
    const mobileWrapperRef = useRef(null);
    const [mobileSavedHeight, setMobileSavedHeight] = useState(null);
    const [mobileSavedWidth, setMobileSavedWidth] = useState(null);

    useEffect(() => {
        // ticker가 있을 때마다 현재 패널 높이를 갱신 저장
        // (ticker가 null이 될 때 이미 저장된 값으로 minHeight 적용)
        if (ticker !== null) {
            if (tickerWrapperRef.current) {
                setSavedHeight(tickerWrapperRef.current.offsetHeight);
            }
            if (mobileWrapperRef.current) {
                const mh = mobileWrapperRef.current.offsetHeight;
                const mw = mobileWrapperRef.current.offsetWidth;
                // display:none(=0)일 때 덮어쓰기 방지
                if (mh > 0) setMobileSavedHeight(mh);
                if (mw > 0) setMobileSavedWidth(mw);
            }
        }
    }, [ticker]);

    // ── 서버 응답 대기 중 렌더 차단 ──────────────────────────────
    /**
     * walletLoading이 true인 동안(= fetchWallet API 응답 전)은 아무것도 렌더하지 않음.
     * 이유:
     *   API 응답이 오기 전에 페이지를 렌더하면 서버 다운 시
     *   에러 페이지로 navigate 하기까지 ~0.3초간 BinancePage가 노출됨.
     *   null을 반환하면 빈 화면으로 대기하다가 응답 후 정상 렌더 또는 에러 페이지로 이동.
     */
    // 서버 다운 → URL 유지한 채 에러 페이지 인라인 렌더
    if (serverError) return <ErrorPage code={serverError} />;

    if (walletLoading) return null;

    // ── JSX 렌더링 ───────────────────────────────────────────────
    /**
     * JSX: JavaScript 안에서 HTML처럼 보이는 문법.
     * 실제로는 React.createElement() 호출로 변환됨.
     * jQuery에서 $('<div>...').appendTo('#app') 처럼 DOM을 만드는 것과 다르게,
     * React는 가상 DOM(Virtual DOM)에서 변경사항을 계산한 뒤 실제 DOM에 최소한만 반영.
     */
    return (
        <Layout footerCenter={['TypeScript', 'WebSocket', 'Binance API', 'Axios']}>
            {/* 전체 페이지 배경 */}
            <div style={{
                minHeight: '100%',
                background: '#0a0f1e',       // 아주 어두운 남색 배경
                padding: '32px',
                boxSizing: 'border-box',      // padding이 width에 포함되도록
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',     // PC 기준으로 메인 컨텐츠를 세로 중앙 정렬
            }}>
                {/* 최대 너비 중앙 정렬 컨테이너 (PC에서 조금 더 넓게 사용) */}
                <div style={{ maxWidth: '1120px', margin: '0 auto' }}>

                    {/* ── 페이지 헤더 ─────────────────────────────── */}
                    {/*
                      좌: 기준시각 (ticker 수신 후 표시, 없으면 빈 칸 유지로 레이아웃 고정)
                      우: Binance × Upbit 텍스트 — 테두리 없이 색상만으로 구분
                    */}
                    <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: '24px',
                    }}>
                        {/* 좌측: 기준시각 */}
                        <span style={{ color: '#475569', fontSize: '11px' }}>
                            {ticker ? new Date(ticker.E).toLocaleTimeString('ko-KR') + ' 기준' : ''}
                        </span>

                        {/* 우측: 거래소 표시 — 테두리 없이 색상으로만 구분, 크기 업 */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <span style={{ color: '#F3BA2F', fontWeight: 800, fontSize: '20px' }}>
                                Binance
                            </span>
                            <span style={{ color: '#475569', fontSize: '20px', fontWeight: 300 }}>×</span>
                            <span style={{ color: '#60a5fa', fontWeight: 800, fontSize: '20px' }}>
                                Upbit
                            </span>
                        </div>
                    </div>

                    {/* ── 실시간 시세 카드 ─────────────────────────── */}
                    {/*
                      카드 스타일:
                        background: '#0f172a' = 어두운 남색 카드 배경
                        border: '1px solid #1e293b' = 미세한 테두리
                        borderRadius: '16px' = 둥근 모서리
                    */}
                    <div style={{
                        background: '#0f172a',
                        border: '1px solid #1e293b',
                        borderRadius: '16px',
                        padding: '24px',
                        marginBottom: '20px',
                    }}>
                        {/* 코인 선택 탭 + LIVE 상태 표시 (한 줄, space-between) */}
                        <div
                            className={pageStyles.tickerHeaderRow}
                            style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            marginBottom: '16px',
                            flexWrap: 'wrap',
                            gap: '8px',
                        }}
                        >
                            {/* 좌측: 코인 선택 탭 */}
                            <div className={pageStyles.coinTabsScroll}>
                                {COINS.map((coin) => {
                                    const isActive = coin.symbol === selectedSymbol;
                                    return (
                                        <button
                                            key={coin.symbol}
                                            type="button"
                                            className={pageStyles.coinTab}
                                            onClick={() => setSelectedSymbol(coin.symbol)}
                                            style={{
                                                padding: '6px 12px',
                                                borderRadius: '999px',
                                                border: isActive ? '1px solid #F3BA2F' : '1px solid #1e293b',
                                                background: isActive ? '#F3BA2F' : 'transparent',
                                                color: isActive ? '#000000' : '#e5e7eb',
                                                fontSize: '12px',
                                                fontWeight: 700,
                                                cursor: 'pointer',
                                                touchAction: 'manipulation',
                                                outline: isActive ? '2px solid #F3BA2F' : 'none',
                                                outlineOffset: '2px',
                                            }}
                                        >
                                            {coin.code}
                                        </button>
                                    );
                                })}
                            </div>

                            {/* 우측: LIVE 상태 표시 + USDT 환율 */}
                            {/*
                              USDT 가격을 LIVE 도트 바로 아래에 작게 표시.
                              TODO: 실데이터 연동 후 '₩9,999' → 실제 KRW-USDT 값으로 교체.
                            */}
                            <div
                                className={pageStyles.liveStatusBlock}
                                style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}
                            >
                                {/* LIVE 도트 + 상태 텍스트 */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    {/* 가격 갱신 시 내부가 채워지는 동그라미 */}
                                    <span style={{
                                        width: '10px',
                                        height: '10px',
                                        borderRadius: '50%',
                                        border: `2px solid ${color}`,
                                        backgroundColor: status === 'connected' ? color : 'transparent',
                                        display: 'inline-block',
                                        boxSizing: 'border-box',
                                        transition: prefersReducedMotion ? 'none' : 'background-color 0.15s ease-out',
                                    }} />
                                    {/* 상태 텍스트: LIVE / 연결 중... / 연결 끊김 */}
                                    <span style={{ color, fontSize: '11px', fontWeight: '700', letterSpacing: '1px' }}>
                                        {text}
                                    </span>
                                </div>
                                {/* USDT 환율: 수신 완료 시 실값, 대기 중이면 '...' */}
                                <span style={{ color: '#475569', fontSize: '11px', fontFamily: 'monospace', fontVariantNumeric: 'tabular-nums' }}>
                                    {usdtTicker
                                        ? '1 USDT = ₩' + Math.round(usdtTicker.trade_price).toLocaleString('ko-KR')
                                        : '1 USDT = ...'}
                                </span>
                            </div>
                        </div>

                        {/*
                          tickerWrapperRef: 실데이터 표시 중 높이를 측정하기 위한 래퍼 div.
                          ticker가 null(스켈레톤)일 때 savedHeightRef.current를 minHeight로 적용
                          → 패널이 줄어들지 않고 스켈레톤이 그 안에서 교체됨.
                          ticker가 non-null이면 minHeight 해제 → 실데이터가 높이를 자연스럽게 결정.
                        */}
                        <div
                            ref={tickerWrapperRef}
                            style={{
                                minHeight: ticker === null && savedHeight
                                    ? `${savedHeight}px`
                                    : undefined,
                            }}
                        >
                            {/* PC 레이아웃 (>768px) */}
                            <div className={pageStyles.pcOnly}>
                                <BinanceTicker
                                    ticker={ticker}
                                    upbitTicker={selectedCoin.upbitCode ? upbitTicker : undefined}
                                    usdtKrwTicker={usdtTicker}
                                    pairLabel={selectedCoin.label}
                                />
                            </div>
                            {/* 모바일 전용 레이아웃 (≤768px) */}
                            <div
                                ref={mobileWrapperRef}
                                className={pageStyles.mobileOnly}
                                style={{
                                    minHeight: ticker === null && mobileSavedHeight
                                        ? `${mobileSavedHeight}px`
                                        : undefined,
                                    minWidth: ticker === null && mobileSavedWidth
                                        ? `${mobileSavedWidth}px`
                                        : undefined,
                                }}
                            >
                                <BinanceTickerMobile
                                    ticker={ticker}
                                    upbitTicker={selectedCoin.upbitCode ? upbitTicker : undefined}
                                    usdtKrwTicker={usdtTicker}
                                    pairLabel={selectedCoin.label}
                                />
                            </div>
                        </div>
                    </div>

                    {/* ── 지갑 잔고 카드 ──────────────────────────────────────── */}
                    <div style={{
                        background: '#0f172a',
                        border: '1px solid #1e293b',
                        borderRadius: '16px',
                        padding: '24px',
                    }}>
                        {/*
                          BinanceWallet 컴포넌트에 3가지 상태 전달:
                          - accountInfo: REST API 응답 데이터
                          - loading: API 호출 중 여부
                          - error: 에러 메시지 (없으면 null)
                          서버 5xx/네트워크 오류는 fetchWallet catch에서 에러 페이지로 이동하므로
                          여기까지 오는 error는 4xx 앱 레벨 오류만 해당.
                        */}
                        <BinanceWallet
                            accountInfo={accountInfo}
                            loading={walletLoading}
                            error={walletError}
                        />
                    </div>

                </div>
            </div>
        </Layout>
    );
}

export default BinancePage;
