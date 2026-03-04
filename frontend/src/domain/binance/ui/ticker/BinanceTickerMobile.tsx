// Purpose: 바이낸스 모바일 전용 시세 컴포넌트 — 고가/현재가/저가 · 프리미엄 · KRW · InfoBox 세로 스택

/**
 * ─────────────────────────────────────────────────────────────────
 *  왜 별도 파일인가?
 * ─────────────────────────────────────────────────────────────────
 *  BinanceTicker.tsx의 3열 그리드는 inline style로 gridColumn/gridRow가
 *  고정되어 있어 CSS media query로 오버라이드가 불가능함.
 *  → PC 코드를 전혀 손대지 않고 모바일 전용 레이아웃을 분리하는 방식 채택.
 *
 *  BinancePage.jsx에서 CSS display:none/block으로 PC/모바일 전환.
 * ─────────────────────────────────────────────────────────────────
 */

import React from 'react';
import type { BinanceTicker as BinanceTickerData } from '../../model/hook/useBinanceWebSocket';
import type { UpbitTicker as UpbitTickerData } from '../../model/hook/useUpbitWebSocket';
import styles from './BinanceTickerMobile.module.css';

// ─────────────────────────────────────────────────────────────────
//  Props 타입 (BinanceTicker.tsx와 동일한 인터페이스 유지)
// ─────────────────────────────────────────────────────────────────

interface BinanceTickerMobileProps {
    /** 바이낸스 WebSocket 시세. null = 로딩 중(스켈레톤 표시) */
    ticker: BinanceTickerData | null;
    /** 업비트 KRW 시세. undefined = 미상장, null = 로딩 중, 객체 = 수신 완료 */
    upbitTicker?: UpbitTickerData | null;
    /** 업비트 KRW-USDT 환율. null = 미수신 */
    usdtKrwTicker?: UpbitTickerData | null;
    /** 거래쌍 라벨 (현재 미사용, 향후 헤더 확장 시 사용) */
    pairLabel?: string;
}

// ─────────────────────────────────────────────────────────────────
//  유틸리티 함수
//  BinanceTicker.tsx와 동일한 함수. 공용 모듈 분리 없이 독립 유지.
//  (두 컴포넌트는 완전히 독립적으로 동작해야 함)
// ─────────────────────────────────────────────────────────────────

/** 바이낸스 가격 문자열 → "$42,000.53" 형식 */
const fmt = (val: string, decimals = 2): string => {
    const num = parseFloat(val);
    if (isNaN(num)) return '-';
    return '$' + num.toLocaleString('en-US', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
    });
};

/** KRW 숫자 → "₩135,000,000" 형식 */
const fmtKrw = (val: number): string => {
    if (Number.isNaN(val)) return '-';
    return '₩' + val.toLocaleString('ko-KR', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    });
};

/** 현재가와의 차이 → "+$2,000.00" 형식 */
const fmtDiff = (diff: number): string => {
    if (isNaN(diff)) return '-';
    const sign = diff > 0 ? '+' : diff < 0 ? '-' : '';
    const abs = Math.abs(diff);
    return sign + '$' + abs.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
};

/** 거래량 문자열 → "12,345.68 BTC" 형식 */
const fmtVol = (val: string): string => {
    const num = parseFloat(val);
    if (isNaN(num)) return '-';
    return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' BTC';
};

/** 변동률 문자열 → CSS 색상 반환 (양수 초록, 음수 빨강) */
const changeColor = (p: string): string => {
    const num = parseFloat(p);
    if (isNaN(num)) return '#ffffff';
    return num >= 0 ? '#2ecc71' : '#e74c3c';
};

/** 프리미엄 절댓값 → "₩1,200,000" 형식 (부호는 호출부에서 별도 처리) */
const fmtPremiumAbs = (val: number): string => {
    const abs = Math.abs(val);
    if (isNaN(abs)) return '-';
    return '₩' + abs.toLocaleString('ko-KR', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    });
};

// ─────────────────────────────────────────────────────────────────
//  Shimmer 스켈레톤
// ─────────────────────────────────────────────────────────────────

/** shimmer 키프레임. BinanceTicker.tsx와 이름 충돌 방지를 위해 'shimmerMobile' 사용 */
const shimmerStyle = `
@keyframes shimmerMobile {
    0%   { background-position: -200% 0; }
    100% { background-position:  200% 0; }
}
`;

/** shimmer 애니메이션 블록 */
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
            animation: 'shimmerMobile 1.5s infinite linear',
            ...style,
        }} />
    );
}

/**
 * 모바일 레이아웃에 맞춘 스켈레톤.
 * 실제 렌더링 구조(5개 섹션)와 동일한 높이로 배치해 레이아웃 이동(Layout Shift) 방지.
 */
function BinanceTickerMobileSkeleton() {
    return (
        <div>
            <style>{shimmerStyle}</style>

            {/* 고가 라인 */}
            <div style={{ display: 'flex', justifyContent: 'center', padding: '8px 0' }}>
                <SkeletonBox width="160px" height="14px" />
            </div>

            {/* 구분선 */}
            <div style={{ borderTop: '1px solid #1e293b' }} />

            {/* 현재가 */}
            <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 6px' }}>
                <SkeletonBox width="180px" height="38px" borderRadius="8px" />
            </div>

            {/* 등락 */}
            <div style={{ display: 'flex', justifyContent: 'center', paddingBottom: '12px' }}>
                <SkeletonBox width="120px" height="18px" />
            </div>

            {/* 구분선 */}
            <div style={{ borderTop: '1px solid #1e293b' }} />

            {/* 저가 라인 */}
            <div style={{ display: 'flex', justifyContent: 'center', padding: '8px 0' }}>
                <SkeletonBox width="160px" height="14px" />
            </div>

            {/* 프리미엄 섹션 */}
            <div style={{ borderTop: '1px solid #1e293b', padding: '14px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
                <SkeletonBox width="60px" height="12px" />
                <SkeletonBox width="130px" height="22px" borderRadius="4px" />
                <SkeletonBox width="50px" height="14px" borderRadius="4px" />
            </div>

            {/* KRW 2열 */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderTop: '1px solid #1e293b', padding: '14px 0', gap: '8px' }}>
                <SkeletonBox height="48px" borderRadius="8px" />
                <SkeletonBox height="48px" borderRadius="8px" />
            </div>

            {/* InfoBox 4개 */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '12px' }}>
                {[1, 2, 3, 4].map(i => (
                    <SkeletonBox key={i} height="52px" borderRadius="10px" />
                ))}
            </div>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────
//  InfoBox (모바일용 — 중앙 정렬)
// ─────────────────────────────────────────────────────────────────

/**
 * 라벨 + 값 쌍 박스. PC BinanceTicker.tsx의 InfoBox와 동일한 역할이지만
 * 모바일에서는 중앙 정렬 + 더 작은 폰트로 표시.
 */
function MobileInfoBox({ label, value, color = '#94a3b8' }: { label: string; value: string; color?: string }) {
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
 * BinanceTickerMobile
 *
 * 모바일(≤768px)에서 BinanceTicker.tsx 대신 렌더링되는 컴포넌트.
 * BinancePage.jsx에서 CSS display:none/block으로 전환 (JS 없음).
 *
 * 레이아웃:
 *   [↑ 고가] — [현재가 + 등락] — [↓ 저가]
 *   [프리미엄]
 *   [USD×USDT | UPBIT] (2열)
 *   [InfoBox 4개] (2×2)
 *   [집계 기간]
 */
function BinanceTickerMobile({ ticker, upbitTicker, usdtKrwTicker }: BinanceTickerMobileProps) {

    // 데이터 미수신 시 스켈레톤 표시 (심볼 변경 시에도 setTicker(null)로 트리거됨)
    if (!ticker) return <BinanceTickerMobileSkeleton />;

    // ── 사전 계산 ──────────────────────────────────────────────────
    const color      = changeColor(ticker.P);
    const isPositive = parseFloat(ticker.P) >= 0;
    const sign       = isPositive ? '+' : '';

    const currentPrice = parseFloat(ticker.c);
    const highDiff     = fmtDiff(parseFloat(ticker.h) - currentPrice); // 고가 - 현재가 (+양수)
    const lowDiff      = fmtDiff(parseFloat(ticker.l) - currentPrice); // 저가 - 현재가 (-음수)

    // 업비트 관련
    const hasUpbitMarket = upbitTicker !== undefined;
    const hasUpbitData   = upbitTicker !== undefined && upbitTicker !== null;
    const upbitPrice     = upbitTicker?.trade_price ?? NaN;

    // 프리미엄 계산 (업비트 KRW - 환율기준 KRW)
    const hasUsdtRate  = usdtKrwTicker != null;
    const calcKrw      = hasUsdtRate ? currentPrice * usdtKrwTicker!.trade_price : null;
    const premium      = (hasUpbitData && calcKrw !== null) ? upbitPrice - calcKrw : null;
    const premiumRate  = (premium !== null && calcKrw !== null) ? (premium / calcKrw) * 100 : null;
    const premiumColor = premium !== null ? (premium >= 0 ? '#2ecc71' : '#e74c3c') : '#475569';
    const premiumSign  = premium !== null && premium >= 0 ? '+' : '';

    return (
        <div>

            {/* ── 섹션 1: 고가 / 현재가+등락 / 저가 ──────────────── */}
            {/*
              PC와 동일한 정보지만 세로로 배치.
              고가↔현재가, 현재가↔저가 사이에 얇은 구분선으로 구역 구분.
            */}

            {/* 고가 라인 */}
            <div className={styles.highLine}>
                <span className={styles.highLowArrow} style={{ color: '#2ecc71' }}>↑</span>
                <span className={styles.highLowLabel}>24H 고가</span>
                <span className={styles.highValue}>{fmt(ticker.h)}</span>
                <span className={styles.diffValue}>({highDiff})</span>
            </div>

            <div className={styles.priceDivider} />

            {/* 현재가 */}
            <div className={styles.currentPrice}>{fmt(ticker.c)}</div>

            {/* 등락금액 + 등락률 */}
            <div className={styles.change} style={{ color }}>
                {sign}{parseFloat(ticker.p).toFixed(2)}&nbsp;({sign}{parseFloat(ticker.P).toFixed(2)}%)
            </div>

            <div className={styles.priceDivider} />

            {/* 저가 라인 */}
            <div className={styles.lowLine}>
                <span className={styles.highLowArrow} style={{ color: '#e74c3c' }}>↓</span>
                <span className={styles.highLowLabel}>24H 저가</span>
                <span className={styles.lowValue}>{fmt(ticker.l)}</span>
                <span className={styles.diffValue}>({lowDiff})</span>
            </div>

            {/* ── 섹션 2: 프리미엄 ─────────────────────────────────── */}
            {/*
              업비트 KRW - (바이낸스 USD × USDT환율) = 김치프리미엄.
              두 데이터 수신 완료 전까지 스켈레톤 표시.
            */}
            <div className={styles.premiumSection}>
                <div className={styles.premiumLabel}>프리미엄</div>

                {/* 차이금액 */}
                {premium !== null ? (
                    <div className={styles.premiumAmount} style={{ color: premiumColor }}>
                        {premiumSign}{fmtPremiumAbs(premium)}
                    </div>
                ) : (
                    <SkeletonBox width="130px" height="22px" borderRadius="4px" />
                )}

                {/* 퍼센트 */}
                {premiumRate !== null ? (
                    <div className={styles.premiumRate} style={{ color: premiumColor }}>
                        {premiumSign}{premiumRate.toFixed(2)}%
                    </div>
                ) : (
                    <SkeletonBox width="60px" height="14px" borderRadius="4px" style={{ marginTop: '2px' }} />
                )}
            </div>

            {/* ── 섹션 3: KRW 2열 ──────────────────────────────────── */}
            {/*
              USD×USDT(환율기준 KRW)와 업비트 실제 KRW를 좌우로 나란히 표시.
              중앙 세로선으로 구분. 업비트 미상장 코인이면 좌측 열만 표시.
            */}
            <div className={styles.krwSection}>
                {/* 좌: 환율기준 KRW */}
                <div className={styles.krwCol}>
                    <div className={styles.krwLabel}>USD×USDT</div>
                    {calcKrw !== null ? (
                        <div className={styles.krwPrice} style={{ color: '#94a3b8' }}>
                            {fmtKrw(calcKrw)}
                        </div>
                    ) : (
                        <SkeletonBox height="26px" borderRadius="4px" style={{ margin: '0 12px' }} />
                    )}
                </div>

                {/* 우: 업비트 실제 KRW (미상장이면 렌더링 생략) */}
                {hasUpbitMarket && (
                    <div className={styles.krwCol}>
                        <div className={styles.krwLabel}>UPBIT</div>
                        {hasUpbitData ? (
                            <div className={styles.krwPrice} style={{ color: '#22c55e' }}>
                                {fmtKrw(upbitPrice)}
                            </div>
                        ) : (
                            <SkeletonBox height="26px" borderRadius="4px" style={{ margin: '0 12px' }} />
                        )}
                    </div>
                )}
            </div>

            {/* ── 섹션 4: InfoBox 4개 (2×2) ────────────────────────── */}
            <div className={styles.infoGrid}>
                {/* 전일 종가: 어제 마지막 가격 */}
                <MobileInfoBox label="전일 종가" value={fmt(ticker.x)} />

                {/* 거래량: 24H BTC 수량 */}
                <MobileInfoBox label="거래량 (24H)" value={fmtVol(ticker.v)} />

                {/* 거래대금: 24H USDT 금액 (B = Billion 단위) */}
                <MobileInfoBox
                    label="거래대금"
                    value={'$' + (parseFloat(ticker.q) / 1e9).toFixed(2) + 'B'}
                />

                {/* 체결 횟수: 24H 거래 발생 횟수 */}
                <MobileInfoBox
                    label="체결 횟수"
                    value={ticker.n.toLocaleString('en-US') + '건'}
                />
            </div>

            {/* ── 섹션 5: 집계 기간 ────────────────────────────────── */}
            {/*
              ticker.O = 통계 시작 Unix ms, ticker.C = 통계 종료 Unix ms.
              항상 24시간 간격.
            */}
            <div className={styles.period}>
                집계 기간: {new Date(ticker.O).toLocaleString('ko-KR')} ~ {new Date(ticker.C).toLocaleString('ko-KR')}
            </div>

        </div>
    );
}

export default BinanceTickerMobile;
