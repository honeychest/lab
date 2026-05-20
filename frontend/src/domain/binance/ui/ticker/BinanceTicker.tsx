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
import {
    buildBinanceTickerDisplayModel,
    formatBinancePrice as fmt,
    formatBinanceVolume as fmtVol,
    formatKrwPrice as fmtKrw,
    formatPremiumKrwAbs as fmtPremiumAbs,
    formatUsdDiff as fmtDiff,
} from '../../model/display/binanceTickerDisplayModel.js';
import TickerSkeletonBox from './shared/TickerSkeletonBox.tsx';
import styles from './BinanceTicker.module.css';

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
/**
 * BinanceTickerSkeleton: ticker=null 시 보여줄 전체 스켈레톤 레이아웃.
 * 실제 BinanceTicker 렌더링 구조(고가라인 · 현재가 · 저가라인 · 그리드 · 집계기간)와
 * 동일한 구조로 배치하여 레이아웃 이동(Layout Shift) 없이 자연스러운 로딩 표시.
 */
function BinanceTickerSkeleton() {
    return (
        <div>
            {/* 고가 라인: fontSize 12px → line-height ≈ 18px */}
            <div className={styles.skeletonHighLine}>
                <TickerSkeletonBox width="160px" height="18px" injectKeyframes />
            </div>

            {/* 현재가 영역: fontSize 40px monospace → line-height ≈ 48px */}
            <div className={styles.skeletonPriceRow}>
                <TickerSkeletonBox width="200px" height="48px" borderRadius="8px" />
                <TickerSkeletonBox width="220px" height="48px" borderRadius="8px" />
            </div>

            {/* 변동액/변동률 행: fontSize 16px → line-height ≈ 20px */}
            <div className={styles.skeletonChangeRow}>
                <TickerSkeletonBox width="80px" height="20px" />
                <TickerSkeletonBox width="60px" height="20px" />
            </div>

            {/* 저가 라인: fontSize 12px → line-height ≈ 18px */}
            <div className={styles.skeletonLowLine}>
                <TickerSkeletonBox width="160px" height="18px" />
            </div>

            {/* 정보 박스 그리드 (4개) */}
            <div className={styles.skeletonInfoGrid}>
                {[1, 2, 3, 4].map((i) => (
                    <div key={i} className={styles.skeletonInfoItem}>
                        <TickerSkeletonBox width="60px" height="14px" style={{ marginBottom: '4px' }} />
                        <TickerSkeletonBox width="80px" height="17px" />
                    </div>
                ))}
            </div>

            {/* 집계 기간 라인: fontSize 11px → line-height ≈ 14px */}
            <div className={styles.skeletonPeriod}>
                <TickerSkeletonBox width="280px" height="14px" />
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
        <div className={styles.infoBox}>
            <div className={styles.infoLabel}>{label}</div>
            <div className={styles.infoValue} style={{ color }}>{value}</div>
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
    const {
        color,
        sign,
        highDiffFromCurrent,
        lowDiffFromCurrent,
        hasUpbitMarket,
        hasUpbitData,
        upbitTradePrice,
        calcKrw,
        premium,
        premiumRate,
        premiumColor,
        premiumSign,
    } = buildBinanceTickerDisplayModel({
        ticker,
        upbitTicker,
        usdtKrwTicker,
    });

    return (
        <div>
            {/* 24시간 고가 */}
            <div className={styles.highLine}>
                <span className={styles.highLowLabel}>24H 고가</span>
                <span className={styles.highValue}>{fmt(ticker.h)}</span>
                <span className={styles.diffValue}>({fmtDiff(highDiffFromCurrent)})</span>
            </div>

            {/* ── 3열 가격 그리드 ── */}
            <div className={styles.priceGridWrapper}>
                <div className={styles.priceGrid}>

                    {/* 좌상: 바이낸스 USD 현재가 */}
                    <span className={styles.usdPrice}>{fmt(ticker.c)}</span>

                    {/* 중앙: 프리미엄 (양 행 span) */}
                    <div className={styles.premiumCell}>
                        <div className={styles.premiumLabel}>프리미엄</div>
                        {premium !== null ? (
                            <div className={styles.premiumAmount} style={{ color: premiumColor }}>
                                {premiumSign}{fmtPremiumAbs(premium)}
                            </div>
                        ) : (
                            <TickerSkeletonBox width="120px" height="20px" borderRadius="4px" />
                        )}
                        {premiumRate !== null ? (
                            <div className={styles.premiumRate} style={{ color: premiumColor }}>
                                {premiumSign}{premiumRate.toFixed(2)}%
                            </div>
                        ) : (
                            <TickerSkeletonBox width="60px" height="14px" borderRadius="4px" style={{ marginTop: '2px' }} />
                        )}
                    </div>

                    {/* 우상: USD × USDT 환율기준 KRW */}
                    <div className={styles.krwUpperCell}>
                        <div className={styles.krwLabel}>USD × USDT</div>
                        {calcKrw !== null ? (
                            <span className={styles.calcKrwPrice}>{fmtKrw(calcKrw)}</span>
                        ) : (
                            <TickerSkeletonBox width="200px" height="42px" borderRadius="8px" />
                        )}
                    </div>

                    {/* 좌하: 바이낸스 등락금액 + 등락률 */}
                    <div className={styles.changeCell}>
                        <span className={styles.changeAmount} style={{ color }}>
                            {sign}{parseFloat(ticker.p).toFixed(2)}
                        </span>
                        <span className={styles.changeRate} style={{ color }}>
                            ({sign}{parseFloat(ticker.P).toFixed(2)}%)
                        </span>
                    </div>

                    {/* 우하: 업비트 실제 KRW */}
                    <div className={styles.upbitCell}>
                        <div className={styles.upbitLabel}>UPBIT</div>
                        {hasUpbitMarket && (
                            hasUpbitData ? (
                                <span className={styles.upbitPrice}>{fmtKrw(upbitTradePrice)}</span>
                            ) : (
                                <TickerSkeletonBox width="200px" height="42px" borderRadius="8px" />
                            )
                        )}
                    </div>
                </div>
            </div>

            {/* 24시간 저가 */}
            <div className={styles.lowLine}>
                <span className={styles.highLowLabel}>24H 저가</span>
                <span className={styles.lowValue}>{fmt(ticker.l)}</span>
                <span className={styles.diffValue}>({fmtDiff(lowDiffFromCurrent)})</span>
            </div>

            {/* ── 정보 박스 그리드 ── */}
            <div className={styles.infoGrid}>
                <InfoBox label="전일 종가"        value={fmt(ticker.x)} />
                <InfoBox label="거래량 (24H Vol)" value={fmtVol(ticker.v)} />
                <InfoBox
                    label="거래대금 (Quote Vol)"
                    value={'$' + (parseFloat(ticker.q) / 1e9).toFixed(2) + 'B'}
                />
                <InfoBox
                    label="체결 횟수 (Trades)"
                    value={ticker.n.toLocaleString('en-US') + ' 건'}
                />
            </div>

            {/* 집계 기간 */}
            <div className={styles.period}>
                집계 기간: {new Date(ticker.O).toLocaleString('ko-KR')} ~ {new Date(ticker.C).toLocaleString('ko-KR')}
            </div>
        </div>
    );
}

export default BinanceTicker;
