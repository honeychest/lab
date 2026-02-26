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
import type { BinanceTicker as BinanceTickerData } from '../../../hooks/useBinanceWebSocket';

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
 * BinancePage.jsx에서 <BinanceTicker ticker={ticker} /> 형태로 사용
 */
interface BinanceTickerProps {
    /**
     * 바이낸스 WebSocket에서 수신한 ticker 데이터.
     * 첫 데이터 수신 전에는 null (로딩 상태).
     * BinanceTickerData = useBinanceWebSocket.ts에서 import한 BinanceTicker 인터페이스
     */
    ticker: BinanceTickerData | null;
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
function BinanceTicker({ ticker }: BinanceTickerProps) {

    // ── 로딩 상태 처리 ──────────────────────────────────────────
    // ticker가 null이면 아직 서버에서 첫 데이터가 안 온 것
    if (!ticker) {
        return (
            <div style={{ color: '#64748b', fontSize: '14px', textAlign: 'center', padding: '20px 0' }}>
                실시간 시세 수신 대기 중...
            </div>
        );
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

    // 타임스탬프 변환:
    //   ticker.E = Unix 밀리초 타임스탬프 (예: 1708924800000)
    //   new Date(ticker.E) → JavaScript Date 객체
    //   toLocaleTimeString('ko-KR') → "오후 3:40:00" 형식의 한국 시간 문자열
    const lastUpdated = new Date(ticker.E).toLocaleTimeString('ko-KR');

    return (
        <div>
            {/* ── 섹션 제목 ──────────────────────────────────────── */}
            <h2 style={{ color: '#94a3b8', fontSize: '13px', fontWeight: '700', letterSpacing: '1px', margin: '0 0 20px 0' }}>
                실시간 시세 · BTC/USDT
            </h2>

            {/* ── 현재가 (메인 표시) ─────────────────────────────── */}
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px', marginBottom: '20px', flexWrap: 'wrap' }}>
                {/* 현재가: 크고 진하게 */}
                <span style={{ color: '#F3BA2F', fontSize: '36px', fontWeight: '800', fontFamily: 'monospace', letterSpacing: '-1px' }}>
                    {fmt(ticker.c)}
                </span>

                {/* 변동액: 24시간 전 대비 가격 차이
                    ticker.p = 변동 금액 (예: "150.00" 또는 "-200.00")
                    sign + ticker.p = "+150.00" 또는 "-200.00" */}
                <span style={{ color, fontSize: '16px', fontWeight: '700', fontFamily: 'monospace' }}>
                    {sign}{parseFloat(ticker.p).toFixed(2)}
                </span>

                {/* 변동률: 퍼센트로 표시
                    ticker.P = 변동률 (예: "0.357" → "+0.36%") */}
                <span style={{ color, fontSize: '14px', fontWeight: '600' }}>
                    ({sign}{parseFloat(ticker.P).toFixed(2)}%)
                </span>

                {/* 마지막 업데이트 시각: 우측 정렬 */}
                <span style={{ color: '#475569', fontSize: '11px', marginLeft: 'auto' }}>
                    {lastUpdated} 기준
                </span>
            </div>

            {/* ── 정보 박스 그리드 ───────────────────────────────── */}
            {/*
              display: flex + flexWrap: wrap 조합:
              화면 넓이에 따라 자동으로 줄 바꿈.
              jQuery로 수동으로 반응형 처리하던 것을 CSS flex로 자동화.
            */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>

                {/* 고가: 24시간 최고가 (ticker.h) */}
                <InfoBox label="고가 (24H High)" value={fmt(ticker.h)} color="#2ecc71" />

                {/* 저가: 24시간 최저가 (ticker.l) */}
                <InfoBox label="저가 (24H Low)"  value={fmt(ticker.l)} color="#e74c3c" />

                {/* 시가: 24시간 전 시작 가격 (ticker.o)
                    open price = 24시간 전 첫 체결가 */}
                <InfoBox label="시가 (24H Open)" value={fmt(ticker.o)} />

                {/* 이전 종가: 어제 마지막 가격 (ticker.x)
                    prev close = 이 값 기준으로 변동액/변동률이 계산됨 */}
                <InfoBox label="전일 종가"        value={fmt(ticker.x)} />

                {/* 매수호가: 내가 팔 때 받을 수 있는 최고 가격 (ticker.b)
                    bid = buyer의 최대 지불 의사 가격 */}
                <InfoBox label="매수호가 (Bid)"   value={fmt(ticker.b)} color="#60a5fa" />

                {/* 매도호가: 내가 살 때 지불해야 하는 최저 가격 (ticker.a)
                    ask = seller의 최소 수취 의사 가격
                    bid < ask 의 차이 = 스프레드(spread) */}
                <InfoBox label="매도호가 (Ask)"   value={fmt(ticker.a)} color="#f97316" />

                {/* 가중평균가: 24시간 전체 체결 금액 ÷ 체결 수량 (ticker.w)
                    VWAP(Volume Weighted Average Price)라고도 부름 */}
                <InfoBox label="가중평균가 (VWAP)" value={fmt(ticker.w)} />

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
