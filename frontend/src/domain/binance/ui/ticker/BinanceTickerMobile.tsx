// [AGENT] 바이낸스 모바일 시세 컴포넌트 — 세로 스택 레이아웃, BinancePage에서 ≤768px 표시
// 연관: BinancePage.jsx, useBinanceWebSocket.ts, useUpbitWebSocket.ts
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
import {
    buildBinanceTickerDisplayModel,
    formatBinancePrice as fmt,
    formatBinanceVolume as fmtVol,
    formatKrwPrice as fmtKrw,
    formatPremiumKrwAbs as fmtPremiumAbs,
    formatUsdDiff as fmtDiff,
} from '../../model/display/binanceTickerDisplayModel.js';
import TickerSkeletonBox from './shared/TickerSkeletonBox.tsx';
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

// ─────────────────────────────────────────────────────────────────
//  Shimmer 스켈레톤
// ─────────────────────────────────────────────────────────────────

/**
 * 모바일 레이아웃에 맞춘 스켈레톤.
 * 실제 렌더링 구조(5개 섹션)와 동일한 높이로 배치해 레이아웃 이동(Layout Shift) 방지.
 */
function BinanceTickerMobileSkeleton() {
    return (
        <div>
            {/* 고가 라인 */}
            <div style={{ display: 'flex', justifyContent: 'center', padding: '8px 0' }}>
                <TickerSkeletonBox width="160px" height="14px" variant="mobile" injectKeyframes />
            </div>

            {/* 구분선 */}
            <div style={{ borderTop: '1px solid var(--dark-border)' }} />

            {/* 현재가 */}
            <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 6px' }}>
                <TickerSkeletonBox width="180px" height="38px" borderRadius="8px" variant="mobile" />
            </div>

            {/* 등락 */}
            <div style={{ display: 'flex', justifyContent: 'center', paddingBottom: '12px' }}>
                <TickerSkeletonBox width="120px" height="18px" variant="mobile" />
            </div>

            {/* 구분선 */}
            <div style={{ borderTop: '1px solid var(--dark-border)' }} />

            {/* 저가 라인 */}
            <div style={{ display: 'flex', justifyContent: 'center', padding: '8px 0' }}>
                <TickerSkeletonBox width="160px" height="14px" variant="mobile" />
            </div>

            {/* 프리미엄 섹션 */}
            <div style={{ borderTop: '1px solid var(--dark-border)', padding: '14px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
                <TickerSkeletonBox width="60px" height="12px" variant="mobile" />
                <TickerSkeletonBox width="130px" height="22px" borderRadius="4px" variant="mobile" />
                <TickerSkeletonBox width="50px" height="14px" borderRadius="4px" variant="mobile" />
            </div>

            {/* KRW 2열 */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderTop: '1px solid var(--dark-border)', padding: '14px 0', gap: '8px' }}>
                <TickerSkeletonBox height="48px" borderRadius="8px" variant="mobile" />
                <TickerSkeletonBox height="48px" borderRadius="8px" variant="mobile" />
            </div>

            {/* InfoBox 4개 */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '12px' }}>
                {[1, 2, 3, 4].map(i => (
                    <TickerSkeletonBox key={i} height="52px" borderRadius="10px" variant="mobile" />
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
    const {
        color,
        sign,
        highDiffFromCurrent,
        lowDiffFromCurrent,
        hasUpbitMarket,
        hasUpbitData,
        upbitTradePrice: upbitPrice,
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
    const highDiff = fmtDiff(highDiffFromCurrent);
    const lowDiff = fmtDiff(lowDiffFromCurrent);

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
                    <TickerSkeletonBox width="130px" height="22px" borderRadius="4px" variant="mobile" />
                )}

                {/* 퍼센트 */}
                {premiumRate !== null ? (
                    <div className={styles.premiumRate} style={{ color: premiumColor }}>
                        {premiumSign}{premiumRate.toFixed(2)}%
                    </div>
                ) : (
                    <TickerSkeletonBox width="60px" height="14px" borderRadius="4px" style={{ marginTop: '2px' }} variant="mobile" />
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
                        <TickerSkeletonBox height="26px" borderRadius="4px" style={{ margin: '0 12px' }} variant="mobile" />
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
                            <TickerSkeletonBox height="26px" borderRadius="4px" style={{ margin: '0 12px' }} variant="mobile" />
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
