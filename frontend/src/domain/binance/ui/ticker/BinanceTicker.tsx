// [AGENT] 바이낸스 시세 컴포넌트 — 현재가/변동/고저가/프리미엄/거래량, shimmer 스켈레톤
// 연관: BinancePage.jsx, useBinanceWebSocket.ts, useUpbitWebSocket.ts
// Purpose: 바이낸스 BTC/USDT 실시간 시세 표시 컴포넌트 — 현재가·변동률·고저가·호가·거래량 UI

/**
 * ─────────────────────────────────────────────────────────────────
 *  네이밍 충돌 해결 안내
 * ─────────────────────────────────────────────────────────────────
 *  문제:
 *    이 파일의 컴포넌트 함수 이름도 'BinanceTicker'이고,
 *    useBinanceWebSocket.ts에서 export한 인터페이스 이름도 'BinanceTicker'임.
 *    같은 이름을 import하면 TypeScript가 어느 것인지 구분 못 함.
 *
 *  해결:
 *    import type { BinanceTicker as BinanceTickerData } 로 alias(별칭) 지정.
 *    'as BinanceTickerData' = "이 타입을 이 파일 안에서는 BinanceTickerData로 부르겠다"
 *    jQuery에서 var $ = jQuery.noConflict(); 와 비슷한 네임스페이스 충돌 회피 기법.
 *
 *  import type:
 *    타입 전용 import. 런타임 번들에 포함되지 않음.
 *    TypeScript가 타입 체크에만 사용하고, 빌드 후 JavaScript에는 남지 않음.
 * ─────────────────────────────────────────────────────────────────
 */
import React from 'react';
import type { BinanceTicker as BinanceTickerData } from '../../model/hook/useBinanceWebSocket';
import type { UpbitTicker as UpbitTickerData } from '../../model/hook/useUpbitWebSocket';

/**
 * 이 컴포넌트에서 "표시할 수 있는" ticker 필드 요약
 *
 *  - 현재가: ticker.c
 *  - 변동 금액: ticker.p
 *  - 변동률(%): ticker.P
 *  - 고가(24H High): ticker.h
 *  - 저가(24H Low): ticker.l
 *  - 시가(24H Open): ticker.o
 *  - 전일 종가: ticker.x
 *  - 매수호가(Bid): ticker.b
 *  - 매도호가(Ask): ticker.a
 *  - 가중평균가(VWAP): ticker.w
 *  - 거래량(BTC, 24H Vol): ticker.v
 *  - 거래대금(USDT, Quote Vol): ticker.q
 *  - 체결 횟수: ticker.n
 *  - 이벤트 시각: ticker.E
 *  - 통계 기간: ticker.O ~ ticker.C
 *
 * 현재 UI에서는 이 중 일부만 사용하지만,
 * 나중에 디자인을 바꿀 때 어떤 값들을 다시 살릴 수 있는지 한눈에 보기 위함.
 */

// ─────────────────────────────────────────────────────────────────
//  Props 타입 정의
//  - 컴포넌트가 부모로부터 받는 인자(매개변수)의 타입 선언
//  - jQuery 플러그인의 options 객체 구조를 미리 선언하는 것과 유사
// ─────────────────────────────────────────────────────────────────

/**
 * 정보 박스 1개(라벨 + 값 쌍)의 Props
 * 이 컴포넌트 안에서만 사용되는 내부 컴포넌트용 타입
 */
interface InfoBoxProps {
    /** 항목 라벨. 예: "고가", "저가", "매수호가" */
    label: string;
    /** 표시할 값 (이미 포맷된 문자열). 예: "$42,000.00" */
    value: string;
    /** 값 텍스트 색상. CSS color 값. 기본값은 '#94a3b8' (회색) */
    color?: string;
}

/**
 * BinanceTicker 컴포넌트의 Props
 * BinancePage.jsx에서 <BinanceTicker ticker={ticker} pairLabel="BTC / USDT" /> 형태로 사용
 */
interface BinanceTickerProps {
    /**
     * 바이낸스 WebSocket에서 수신한 ticker 데이터.
     * 첫 데이터 수신 전에는 null (로딩 상태).
     * BinanceTickerData = useBinanceWebSocket.ts에서 import한 BinanceTicker 인터페이스
     */
    ticker: BinanceTickerData | null;
    /**
     * 업비트 KRW 현재가 데이터.
     * - undefined: 업비트 미지원 코인 (KRW 블록 자체를 숨김)
     * - null: 업비트 지원 코인이지만 아직 연결 중/데이터 미수신
     * - 객체: 업비트 현재가 수신 완료
     */
    upbitTicker?: UpbitTickerData | null;
    /**
     * 업비트 KRW-USDT 환율 데이터.
     * - null: 아직 수신 전
     * - 객체: 수신 완료 (trade_price = 1 USDT의 KRW 가격, 사실상 달러 환율)
     * 이 값으로 '바이낸스 USD × USDT환율 = 환율 기준 KRW'를 계산.
     */
    usdtKrwTicker?: UpbitTickerData | null;
    /**
     * 헤더에 표시할 거래쌍 라벨.
     * 예: "BTC / USDT", "ETH / USDT"
     * 전달되지 않으면 기본값 "BTC/USDT" 사용.
     */
    pairLabel?: string;
}

// ─────────────────────────────────────────────────────────────────
//  유틸리티 함수
// ─────────────────────────────────────────────────────────────────

/**
 * 숫자 문자열을 달러 형식으로 포맷.
 *
 * @param val - 바이낸스에서 받은 가격 문자열 (예: "42000.53000000")
 * @param decimals - 소수점 자릿수 (기본값 2)
 * @returns 포맷된 문자열 (예: "$42,000.53") 또는 파싱 실패 시 '-'
 *
 * 왜 parseFloat인가:
 *   바이낸스는 "42000.53000000" 처럼 뒷 자리에 0이 붙은 문자열을 보냄.
 *   parseFloat은 앞에서부터 숫자를 읽다가 숫자가 아닌 문자를 만나면 멈춤.
 *   parseFloat("42000.53abc") → 42000.53 (jQuery $.isNumeric과 달리 변환까지 해줌)
 *
 * toLocaleString('en-US', ...):
 *   jQuery에서 수동으로 천단위 콤마를 넣던 것을 브라우저 내장으로 처리.
 *   { minimumFractionDigits: 2, maximumFractionDigits: 2 } = 소수점 2자리 고정.
 */
const fmt = (val: string, decimals = 2): string => {
    const num = parseFloat(val);
    // isNaN: "Not a Number" 체크. parseFloat("abc") = NaN 이 되므로 방어 처리
    if (isNaN(num)) return '-';
    return '$' + num.toLocaleString('en-US', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
    });
};

/**
 * 업비트 trade_price 숫자를 KRW 통화 문자열로 포맷.
 *
 * @param val - KRW 현재가 숫자
 * @returns 예: "₩135,000,000" 또는 파싱 실패 시 '-'
 */
const fmtKrw = (val: number): string => {
    if (Number.isNaN(val)) return '-';
    return '₩' + val.toLocaleString('ko-KR', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    });
};

/**
 * 현재가와의 차이를 달러 형식으로 포맷.
 *
 * @param diff - 고가/저가와 현재가의 차이 값 (숫자, 양수/음수 모두 가능)
 * @returns "+$123.45" 또는 "-$67.89" 형식 문자열, 계산 불가 시 '-'
 */
const fmtDiff = (diff: number): string => {
    if (isNaN(diff)) return '-';
    const sign = diff > 0 ? '+' : diff < 0 ? '-' : '';
    const abs = Math.abs(diff);
    return sign + '$' + abs.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
};

/**
 * 거래량(BTC 수량)을 읽기 좋은 형식으로 포맷.
 *
 * @param val - 바이낸스에서 받은 거래량 문자열 (예: "12345.67890000")
 * @returns 포맷된 문자열 (예: "12,345.68 BTC") 또는 '-'
 */
const fmtVol = (val: string): string => {
    const num = parseFloat(val);
    if (isNaN(num)) return '-';
    return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' BTC';
};

/**
 * 가격 변동률 문자열을 파싱해서 CSS 색상 반환.
 *
 * @param p - 변동률 문자열 (예: "0.357" 또는 "-0.5")
 * @returns 양수 → 초록(#2ecc71), 음수 → 빨간(#e74c3c), 0/NaN → 흰색
 *
 * 주식/코인 관례:
 *   상승(양수) = 초록, 하락(음수) = 빨간
 *   이 색상값은 변동 텍스트와 변동률 값 모두에 적용됨.
 */
const changeColor = (p: string): string => {
    const num = parseFloat(p);
    if (isNaN(num)) return '#ffffff';
    return num >= 0 ? '#2ecc71' : '#e74c3c';
};

/**
 * 프리미엄(차이금액) 절댓값을 KRW 형식으로 포맷.
 * 부호(+/-)는 호출부에서 premiumSign 변수로 별도 처리.
 *
 * @param val - 차이금액 숫자 (음수여도 절댓값으로 처리)
 * @returns 예: "₩9,999,999" (부호 없음) 또는 파싱 실패 시 '-'
 */
const fmtPremiumAbs = (val: number): string => {
    const abs = Math.abs(val);
    if (isNaN(abs)) return '-';
    return '₩' + abs.toLocaleString('ko-KR', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    });
};

// ─────────────────────────────────────────────────────────────────
//  스켈레톤(Skeleton) 컴포넌트
//  - ticker가 null일 때 실제 레이아웃과 같은 구조로 shimmer 애니메이션을 표시
//  - 코인 탭 전환 시 "데이터 없음" 텍스트 대신 자연스러운 로딩 감을 줌
// ─────────────────────────────────────────────────────────────────

/**
 * CSS @keyframes shimmer 인라인 삽입.
 * CSS Modules나 외부 파일 없이 <style> 태그를 JSX로 주입하는 패턴.
 * 컴포넌트가 마운트될 때 한 번만 DOM에 추가됨.
 */
const shimmerStyle = `
@keyframes shimmer {
    0%   { background-position: -200% 0; }
    100% { background-position:  200% 0; }
}
`;

/**
 * SkeletonBox: shimmer 애니메이션이 적용된 빈 블록.
 *
 * @param width        - CSS 너비 (기본 '100%')
 * @param height       - CSS 높이 (기본 '16px')
 * @param borderRadius - 모서리 반경 (기본 '6px')
 * @param style        - 추가 인라인 스타일 (선택)
 *
 * shimmer 동작 원리:
 *   background: linear-gradient(90deg, 어두운색 25%, 밝은색 50%, 어두운색 75%)
 *   backgroundSize: 200% → gradient 가 요소 너비의 2배로 설정
 *   animation: backgroundPosition을 -200% → +200% 로 이동시키면
 *              밝은 띠가 좌→우로 흘러가는 것처럼 보임
 */
function SkeletonBox({
    width = '100%',
    height = '16px',
    borderRadius = '6px',
    style,
}: {
    width?: string;
    height?: string;
    borderRadius?: string;
    style?: React.CSSProperties;
}) {
    return (
        <div style={{
            width,
            height,
            borderRadius,
            background: 'linear-gradient(90deg, #1e293b 25%, #2d3f52 50%, #1e293b 75%)',
            backgroundSize: '200% 100%',
            animation: 'shimmer 1.5s infinite linear',
            ...style,
        }} />
    );
}

/**
 * BinanceTickerSkeleton: ticker=null 시 보여줄 전체 스켈레톤 레이아웃.
 * 실제 BinanceTicker 렌더링 구조(고가라인 · 현재가 · 저가라인 · 그리드 · 집계기간)와
 * 동일한 구조로 배치하여 레이아웃 이동(Layout Shift) 없이 자연스러운 로딩 표시.
 */
function BinanceTickerSkeleton() {
    return (
        <div>
            {/* @keyframes shimmer CSS 주입 */}
            <style>{shimmerStyle}</style>

            {/* 고가 라인: fontSize 12px → line-height ≈ 18px */}
            <div style={{ marginBottom: '8px' }}>
                <SkeletonBox width="160px" height="18px" />
            </div>

            {/* 현재가 영역: fontSize 40px monospace → line-height ≈ 48px */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '32px', marginBottom: '8px', flexWrap: 'wrap' }}>
                <SkeletonBox width="200px" height="48px" borderRadius="8px" />
                <SkeletonBox width="220px" height="48px" borderRadius="8px" />
            </div>

            {/* 변동액/변동률 행: fontSize 16px → line-height ≈ 20px */}
            <div style={{ display: 'flex', gap: '14px', marginBottom: '8px' }}>
                <SkeletonBox width="80px" height="20px" />
                <SkeletonBox width="60px" height="20px" />
            </div>

            {/* 저가 라인: fontSize 12px → line-height ≈ 18px */}
            <div style={{ marginBottom: '20px' }}>
                <SkeletonBox width="160px" height="18px" />
            </div>

            {/* 정보 박스 그리드 (4개)
                실제 InfoBox: label fontSize 11px(≈14px) + marginBottom 4px + value fontSize 14px(≈17px)
                패딩 12px top/bottom 동일하게 맞춤 */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {[1, 2, 3, 4].map((i) => (
                    <div key={i} style={{
                        background: '#1e293b',
                        borderRadius: '10px',
                        padding: '12px 16px',
                        flex: '1 1 120px',
                        minWidth: '120px',
                    }}>
                        <SkeletonBox width="60px" height="14px" style={{ marginBottom: '4px' }} />
                        <SkeletonBox width="80px" height="17px" />
                    </div>
                ))}
            </div>

            {/* 집계 기간 라인: fontSize 11px → line-height ≈ 14px */}
            <div style={{ marginTop: '12px' }}>
                <SkeletonBox width="280px" height="14px" />
            </div>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────
//  내부 서브 컴포넌트
// ─────────────────────────────────────────────────────────────────

/**
 * InfoBox: 라벨과 값을 한 쌍으로 묶어 표시하는 작은 UI 단위.
 *
 * 사용 예:
 *   <InfoBox label="고가" value="$43,000.00" color="#2ecc71" />
 *
 * React 컴포넌트는 jQuery에서 재사용 HTML 조각을 함수로 만드는 것과 유사:
 *   function renderInfoBox(label, value, color) {
 *     return '<div>...</div>';
 *   }
 * 단, JSX는 string이 아닌 가상 DOM(Virtual DOM) 객체를 반환함.
 */
function InfoBox({ label, value, color = '#94a3b8' }: InfoBoxProps) {
    return (
        <div style={{
            background: '#1e293b',      // 어두운 배경 (카드 느낌)
            borderRadius: '10px',
            padding: '12px 16px',
            minWidth: '120px',
            flex: '1 1 120px',          // flex-grow: 1, flex-shrink: 1, 최소 120px
        }}>
            {/* 라벨: 항목명, 흐린 회색으로 작게 표시 */}
            <div style={{ color: '#64748b', fontSize: '11px', marginBottom: '4px', fontWeight: '600', letterSpacing: '0.5px' }}>
                {label}
            </div>
            {/* 값: props로 받은 color 적용 */}
            <div style={{ color, fontSize: '14px', fontWeight: '700', fontFamily: 'monospace' }}>
                {value}
            </div>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────
//  메인 컴포넌트
// ─────────────────────────────────────────────────────────────────

/**
 * BinanceTicker 컴포넌트
 *
 * BinancePage에서 <BinanceTicker ticker={ticker} /> 형태로 사용.
 *
 * ticker가 null인 경우(첫 데이터 수신 전):
 *   로딩 메시지 표시.
 *
 * ticker가 있는 경우:
 *   현재가, 변동액/변동률, 고가/저가, 매수/매도호가, 시가,
 *   거래량, 거래대금, 가중평균가, 체결횟수, 시간대 표시.
 */
function BinanceTicker({ ticker, upbitTicker, usdtKrwTicker, pairLabel }: BinanceTickerProps) {

    // ── 로딩 상태 처리 ──────────────────────────────────────────
    // ticker가 null이면 아직 서버에서 첫 데이터가 안 온 것
    // (심볼 변경 시 useBinanceWebSocket 훅이 setTicker(null)을 호출하여 스켈레톤 트리거)
    if (!ticker) {
        return <BinanceTickerSkeleton />;
    }

    // ── 화면 표시용 값 사전 계산 ────────────────────────────────
    //
    // ticker.c = 현재가 문자열 (예: "42000.53000000")
    // fmt(ticker.c) → "$42,000.53"
    //
    // 이 변수들은 JSX에서 여러 번 쓰이므로 미리 계산해 놓음.
    // jQuery에서 var price = parseFloat(data.c).toFixed(2); 로 미리 계산하는 것과 동일.
    const color = changeColor(ticker.P);         // 변동률에 따른 색상
    const isPositive = parseFloat(ticker.P) >= 0; // 상승 여부 (부호 기호 결정)
    const sign = isPositive ? '+' : '';            // 양수는 '+' 추가, 음수는 이미 '-'가 있음

    // 현재가/고가/저가 숫자값 및 현재가와의 차이 계산
    const currentPrice = parseFloat(ticker.c);
    const highPrice = parseFloat(ticker.h);
    const lowPrice = parseFloat(ticker.l);
    const highDiffFromCurrent = fmtDiff(highPrice - currentPrice);
    const lowDiffFromCurrent = fmtDiff(lowPrice - currentPrice);

    // ticker.E 타임스탬프는 BinancePage 헤더에서 기준시각으로 표시하므로 여기선 미사용
    const hasUpbitMarket = upbitTicker !== undefined;
    const hasUpbitData = upbitTicker !== undefined && upbitTicker !== null;
    const upbitTradePrice = upbitTicker?.trade_price ?? NaN;

    // ── 환율 기준 KRW 및 프리미엄 계산 ──────────────────────────
    //
    // calcKrw:
    //   바이낸스 USD 현재가 × USDT 환율 = 환율 기준 적정 KRW 가격.
    //   예: $95,000 × ₩1,430/USDT = ₩135,850,000
    //   usdtKrwTicker가 null(미수신)이면 null 유지 → 스켈레톤 표시.
    //
    // premium:
    //   업비트 실제 KRW - 환율기준 KRW = 김치 프리미엄(양수) 또는 역프리미엄(음수).
    //   두 데이터(upbit + usdt) 모두 수신된 경우에만 계산.
    //
    // premiumRate:
    //   프리미엄을 환율기준 KRW 대비 퍼센트로 환산.
    const hasUsdtRate = usdtKrwTicker != null;
    const calcKrw     = hasUsdtRate ? currentPrice * usdtKrwTicker!.trade_price : null;
    const premium     = (hasUpbitData && calcKrw !== null) ? upbitTradePrice - calcKrw : null;
    const premiumRate = (premium !== null && calcKrw !== null) ? (premium / calcKrw) * 100 : null;
    // 프리미엄 양수(한국 비쌈) → 초록, 음수(역프리미엄) → 빨강, 미계산 → 회색
    const premiumColor = premium !== null ? (premium >= 0 ? '#2ecc71' : '#e74c3c') : '#475569';
    const premiumSign  = premium !== null && premium >= 0 ? '+' : '';

    return (
        <div>
            {/* 24시간 고가: 실시간 시세 블록 위에 배치 (현재가와의 차이 함께 표시) */}
            <div style={{ marginBottom: '8px', fontSize: '12px', color: '#9ca3af' }}>
                <span style={{ marginRight: '6px' }}>24H 고가</span>
                <span style={{ color: '#2ecc71', fontWeight: 700, fontFamily: 'monospace' }}>
                    {fmt(ticker.h)}
                </span>
                <span style={{ marginLeft: '8px', fontSize: '11px', color: '#a5b4fc' }}>
                    ({highDiffFromCurrent})
                </span>
            </div>

            {/* ── 3열 가격 그리드 ─────────────────────────────────── */}
            {/*
              레이아웃:
                좌 | 중(프리미엄, 양 행 span) | 우
              ──────────────────────────────────────────────────
              [바이낸스 USD 가격]  [프리미엄]  [USD×USDT 환율기준 KRW]
              [바이낸스 등락]                  [업비트 KRW]
              ──────────────────────────────────────────────────
              TODO: USD×USDT, 프리미엄 — 현재는 디자인 확인용 플레이스홀더.
                    실데이터 연동은 KRW-USDT WebSocket 구현 후 진행.
            */}
            {/*
              overflowX: 'auto' — $100,000+ 같은 넓은 숫자가 들어와도
              카드 레이아웃이 밀리지 않고 가로 스크롤로 처리됨.
            */}
            <div style={{ overflowX: 'auto' }}>
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'auto 150px auto', // 중간 열 고정폭 → 오른쪽 열 안 밀림
                gridTemplateRows: 'auto auto',
                columnGap: '28px',
                rowGap: '8px',
                alignItems: 'center',
                marginBottom: '8px',
                minWidth: 'max-content', // 숫자가 길어져도 열이 찌그러지지 않음
            }}>

                {/* ── 좌상: 바이낸스 USD 현재가 ── */}
                <span style={{
                    gridColumn: 1, gridRow: 1,
                    color: '#F3BA2F', fontSize: '40px', fontWeight: '800',
                    fontFamily: 'monospace', letterSpacing: '-1px',
                }}>
                    {fmt(ticker.c)}
                </span>

                {/* ── 중앙: 프리미엄 차이 (양 행 span) ── */}
                {/*
                  업비트 KRW - (바이낸스 USD × USDT 환율) = 김치 프리미엄
                  양수 = 업비트가 비쌈(프리미엄), 음수 = 업비트가 쌈(역프리미엄)
                  TODO: 실데이터 연동 후 색상도 동적으로 변경 (양수 초록 / 음수 빨강)
                */}
                <div style={{
                    gridColumn: 2, gridRow: '1 / 3',
                    textAlign: 'center',
                    padding: '10px 20px',
                    borderLeft: '1px solid #1e293b',
                    borderRight: '1px solid #1e293b',
                    alignSelf: 'stretch',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center',
                    gap: '4px',
                }}>
                    {/* 라벨 */}
                    <div style={{ color: '#475569', fontSize: '10px', fontWeight: 700, letterSpacing: '1px' }}>
                        프리미엄
                    </div>
                    {/* KRW 차이금액: 두 데이터 수신 완료 후 표시, 대기 중 스켈레톤 */}
                    {premium !== null ? (
                        <div style={{ color: premiumColor, fontSize: '17px', fontWeight: 800, fontFamily: 'monospace' }}>
                            {premiumSign}{fmtPremiumAbs(premium)}
                        </div>
                    ) : (
                        <SkeletonBox width="120px" height="20px" borderRadius="4px" />
                    )}
                    {/* 퍼센트 */}
                    {premiumRate !== null ? (
                        <div style={{ color: premiumColor, fontSize: '12px', fontWeight: 700 }}>
                            {premiumSign}{premiumRate.toFixed(2)}%
                        </div>
                    ) : (
                        <SkeletonBox width="60px" height="14px" borderRadius="4px" style={{ marginTop: '2px' }} />
                    )}
                </div>

                {/* ── 우상: USD × USDT 환율기준 KRW ── */}
                <div style={{ gridColumn: 3, gridRow: 1, textAlign: 'right' }}>
                    {/* 라벨 */}
                    <div style={{ color: '#475569', fontSize: '10px', fontWeight: 700, letterSpacing: '0.5px', marginBottom: '2px' }}>
                        USD × USDT
                    </div>
                    {/* 환율기준 KRW: usdtKrwTicker 수신 완료 후 표시 */}
                    {calcKrw !== null ? (
                        <span style={{ color: '#94a3b8', fontSize: '36px', fontWeight: 800, fontFamily: 'monospace' }}>
                            {fmtKrw(calcKrw)}
                        </span>
                    ) : (
                        <SkeletonBox width="200px" height="42px" borderRadius="8px" />
                    )}
                </div>

                {/* ── 좌하: 바이낸스 등락금액 + 등락률 ── */}
                <div style={{ gridColumn: 1, gridRow: 2, display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                    <span style={{ color, fontSize: '16px', fontWeight: '700', fontFamily: 'monospace' }}>
                        {sign}{parseFloat(ticker.p).toFixed(2)}
                    </span>
                    <span style={{ color, fontSize: '14px', fontWeight: '600' }}>
                        ({sign}{parseFloat(ticker.P).toFixed(2)}%)
                    </span>
                </div>

                {/* ── 우하: 업비트 실제 KRW ── */}
                <div style={{ gridColumn: 3, gridRow: 2, textAlign: 'right' }}>
                    {/* 라벨 */}
                    <div style={{ color: '#475569', fontSize: '10px', fontWeight: 700, letterSpacing: '0.5px', marginBottom: '2px' }}>
                        UPBIT
                    </div>
                    {/* 업비트 KRW 현재가 */}
                    {hasUpbitMarket && (
                        hasUpbitData ? (
                            <span style={{ color: '#22c55e', fontSize: '36px', fontWeight: 800, fontFamily: 'monospace' }}>
                                {fmtKrw(upbitTradePrice)}
                            </span>
                        ) : (
                            <SkeletonBox width="200px" height="42px" borderRadius="8px" />
                        )
                    )}
                </div>
            </div>
            </div>{/* overflowX 래퍼 닫기 */}

            {/* 24시간 저가: 실시간 시세 블록 바로 아래에 배치 (현재가와의 차이 함께 표시) */}
            <div style={{ marginBottom: '20px', fontSize: '12px', color: '#9ca3af' }}>
                <span style={{ marginRight: '6px' }}>24H 저가</span>
                <span style={{ color: '#e74c3c', fontWeight: 700, fontFamily: 'monospace' }}>
                    {fmt(ticker.l)}
                </span>
                <span style={{ marginLeft: '8px', fontSize: '11px', color: '#a5b4fc' }}>
                    ({lowDiffFromCurrent})
                </span>
            </div>

            {/* ── 정보 박스 그리드 ───────────────────────────────── */}
            {/*
              display: flex + flexWrap: wrap 조합:
              화면 넓이에 따라 자동으로 줄 바꿈.
              jQuery로 수동으로 반응형 처리하던 것을 CSS flex로 자동화.
            */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>

                {/* 이전 종가: 어제 마지막 가격 (ticker.x)
                    prev close = 이 값 기준으로 변동액/변동률이 계산됨 */}
                <InfoBox label="전일 종가"        value={fmt(ticker.x)} />

                {/* 거래량: 24시간 동안 거래된 BTC 수량 (ticker.v)
                    예: "12345.678" BTC = 약 12,345 비트코인이 거래됨 */}
                <InfoBox label="거래량 (24H Vol)" value={fmtVol(ticker.v)} />

                {/* 거래대금: 24시간 동안 거래된 USDT 금액 (ticker.q)
                    거래량(BTC 수량) × 평균가 ≒ 거래대금(USDT 금액)
                    표시 형식: 억 단위로 나누어 읽기 쉽게 */}
                <InfoBox
                    label="거래대금 (Quote Vol)"
                    value={'$' + (parseFloat(ticker.q) / 1e9).toFixed(2) + 'B'}
                />
                {/* 1e9 = 10억. 거래대금이 보통 수십억 달러이므로 'B(illion)' 단위로 표시 */}

                {/* 체결 횟수: 24시간 동안 총 몇 번 거래가 발생했는지 (ticker.n)
                    숫자 타입이므로 toLocaleString으로 천단위 콤마 추가 */}
                <InfoBox
                    label="체결 횟수 (Trades)"
                    value={ticker.n.toLocaleString('en-US') + ' 건'}
                />
            </div>

            {/* ── 통계 기간 표시 ──────────────────────────────────── */}
            {/*
              ticker.O = 통계 시작 Unix ms → Date 변환 → 시간 문자열
              ticker.C = 통계 종료 Unix ms → Date 변환 → 시간 문자열
              이 두 값은 항상 24시간 간격임.
            */}
            <div style={{ marginTop: '12px', color: '#475569', fontSize: '11px' }}>
                집계 기간: {new Date(ticker.O).toLocaleString('ko-KR')} ~ {new Date(ticker.C).toLocaleString('ko-KR')}
            </div>
        </div>
    );
}

export default BinanceTicker;
