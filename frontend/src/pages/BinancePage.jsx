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

import { useEffect, useState } from 'react';

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
import Layout from '../layout/Layout.jsx';

/**
 * useBinanceWebSocket: WebSocket 연결 로직을 담은 커스텀 훅.
 * 반환값: { ticker (최신 시세 데이터), status (연결 상태) }
 * 파일: frontend/src/hooks/useBinanceWebSocket.ts
 */
import { useBinanceWebSocket } from '../hooks/useBinanceWebSocket';

/**
 * BinanceTicker: 실시간 시세 UI 컴포넌트 (현재가, 변동률, 고저가 등)
 * 파일: frontend/src/features/binance/components/BinanceTicker.tsx
 */
import BinanceTicker from '../features/binance/components/BinanceTicker';

/**
 * BinanceWallet: 지갑 잔고 UI 컴포넌트 (보유 코인 목록)
 * 파일: frontend/src/features/binance/components/BinanceWallet.tsx
 */
import BinanceWallet from '../features/binance/components/BinanceWallet';

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

// ─────────────────────────────────────────────────────────────────
//  컴포넌트 본체
// ─────────────────────────────────────────────────────────────────

function BinancePage() {

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
    const { ticker, status } = useBinanceWebSocket();

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
                 *
                 *   await: Promise가 완료될 때까지 기다림.
                 *   jQuery에서 $.ajax().done(function(data){...}) 의 data와 같은 것이
                 *   res.data 에 담겨 옴.
                 */
                const res = await axios.get('/api/binance/account');
                setAccountInfo(res.data); // 성공 시 데이터 저장 → BinanceWallet 컴포넌트 재렌더링
            } catch {
                /**
                 * catch: axios 요청 실패 시 실행 (HTTP 4xx, 5xx, 네트워크 오류 등).
                 * jQuery $.ajax의 error 콜백과 동일.
                 * 에러 메시지를 state에 저장 → BinanceWallet에서 에러 UI 표시.
                 */
                setWalletError('잔고 조회에 실패했습니다.');
            } finally {
                /**
                 * finally: 성공/실패 관계없이 항상 실행.
                 * jQuery $.ajax의 complete 콜백과 동일.
                 * 로딩 상태 종료 처리 (스피너 숨김).
                 */
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
    const { color, dot, text } = STATUS_CONFIG[status] ?? STATUS_CONFIG.disconnected;

    // ── JSX 렌더링 ───────────────────────────────────────────────
    /**
     * JSX: JavaScript 안에서 HTML처럼 보이는 문법.
     * 실제로는 React.createElement() 호출로 변환됨.
     * jQuery에서 $('<div>...').appendTo('#app') 처럼 DOM을 만드는 것과 다르게,
     * React는 가상 DOM(Virtual DOM)에서 변경사항을 계산한 뒤 실제 DOM에 최소한만 반영.
     */
    return (
        <Layout footerCenter={[]}>
            {/* 전체 페이지 배경 */}
            <div style={{
                minHeight: '100%',
                background: '#0a0f1e',       // 아주 어두운 남색 배경
                padding: '32px',
                boxSizing: 'border-box',      // padding이 width에 포함되도록
            }}>
                {/* 최대 너비 860px 중앙 정렬 컨테이너 */}
                <div style={{ maxWidth: '860px', margin: '0 auto' }}>

                    {/* ── 페이지 헤더 ─────────────────────────────── */}
                    <div style={{
                        display: 'flex',
                        justifyContent: 'space-between', // 제목은 좌측, 상태는 우측
                        alignItems: 'center',
                        marginBottom: '24px',
                    }}>
                        {/* 페이지 제목 */}
                        <h1 style={{
                            color: '#F3BA2F',     // 바이낸스 브랜드 옐로우
                            margin: 0,
                            fontSize: '22px',
                            fontWeight: '800',
                            letterSpacing: '-0.5px',
                        }}>
                            Binance Dashboard
                        </h1>

                        {/* WebSocket 연결 상태 인디케이터 */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                            {/*
                              상태 표시 점(dot):
                              dot=true(connected)일 때 boxShadow로 글로우 효과 추가.
                              CSS box-shadow 글로우 = 빛나는 것처럼 보이는 효과.
                            */}
                            <span style={{
                                width: '8px',
                                height: '8px',
                                borderRadius: '50%',                     // 원형
                                background: color,                       // 상태에 따른 색상
                                display: 'inline-block',
                                boxShadow: dot ? `0 0 6px ${color}` : 'none', // 연결됐을 때만 글로우
                            }} />
                            {/* 상태 텍스트: "LIVE", "연결 중...", "연결 끊김" */}
                            <span style={{ color, fontSize: '12px', fontWeight: '700', letterSpacing: '1px' }}>
                                {text}
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
                        {/*
                          BinanceTicker 컴포넌트에 ticker 데이터 전달.
                          ticker가 null이면 BinanceTicker 내부에서 로딩 메시지 표시.
                          ticker가 있으면 시세 정보 모두 표시.
                        */}
                        <BinanceTicker ticker={ticker} />
                    </div>

                    {/* ── 지갑 잔고 카드 ───────────────────────────── */}
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
