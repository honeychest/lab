// [AGENT] TASK-07/08: PatternStrip 전면 개편 — StripHeader(Score+트리거배지) + StripCards(Lightweight Charts v5)
// Props: symbol, latestCandleTime, params (patterns prop 제거)
// API: GET /api/signal/pattern, GET /api/signal/score
import { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import { createChart, LineSeries } from 'lightweight-charts';

// ─── 상수 ────────────────────────────────────────────────────────────────────

const SCORE_GREEN  = '#00e887';
const SCORE_YELLOW = 'rgba(240,192,64,0.9)';
const SCORE_RED    = '#ff3b5c';
const UP_COLOR     = '#00e887';
const DOWN_COLOR   = '#ff3b5c';
const NOW_BORDER   = 'rgba(255,255,255,0.3)';
const NOW_BG       = 'rgba(255,255,255,0.04)';
const CARD_BG      = 'rgba(255,255,255,0.02)';
const CARD_BORDER  = 'rgba(255,255,255,0.04)';

function scoreColor(pct) {
    if (pct >= 70) return SCORE_GREEN;
    if (pct >= 40) return SCORE_YELLOW;
    return SCORE_RED;
}

// ─── 미니 라인 차트 카드 ──────────────────────────────────────────────────────

function CaseChart({ candles = [], triggerIdx = 0, isNow = false }) {
    const containerRef = useRef(null);
    const chartRef     = useRef(null);
    const seriesRef    = useRef(null);
    const isInitRef    = useRef(false);

    useEffect(() => {
        if (!containerRef.current) return;
        if (!isInitRef.current) {
            const chart = createChart(containerRef.current, {
                autoSize: true,
                handleScale: false,
                handleScroll: false,
                layout: {
                    background: { color: 'transparent' },
                    textColor: 'rgba(255,255,255,0.2)',
                    attributionLogo: false,
                },
                grid: {
                    vertLines: { visible: false },
                    horzLines: { color: 'rgba(255,255,255,0.03)' },
                },
                timeScale: { visible: false },
                rightPriceScale: { visible: false },
                crosshair: {
                    horzLine: { visible: false },
                    vertLine: { visible: false },
                },
            });

            const series = chart.addSeries(LineSeries, {
                color: isNow ? 'rgba(255,255,255,0.5)' : 'rgba(80,160,255,0.8)',
                lineWidth: 1,
                lineStyle: isNow ? 3 : 0, // 3 = dashed
                crosshairMarkerVisible: false,
            });

            chartRef.current  = chart;
            seriesRef.current = series;
            isInitRef.current = true;
        }

        if (seriesRef.current && candles.length > 0) {
            const chartData = candles
                .map((c, i) => ({
                    time:  i + 1, // ordinal time to avoid duplicate
                    value: c.rel_pct,
                }));

            seriesRef.current.setData(chartData);

            // 트리거 마커
            if (triggerIdx >= 0 && triggerIdx < chartData.length) {
                seriesRef.current.setMarkers([{
                    time:     chartData[triggerIdx].time,
                    position: 'inBar',
                    color:    'rgba(255,255,255,0.7)',
                    shape:    'circle',
                    size:     1,
                }]);
            }

            chartRef.current?.timeScale().fitContent();
        }

        return () => {};
    }, [candles, triggerIdx, isNow]);

    useEffect(() => () => { chartRef.current?.remove(); }, []);

    return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />;
}

// ─── 사례 카드 ────────────────────────────────────────────────────────────────

function CaseCard({ caseData, onClick }) {
    const isNow = caseData.case_date === 'NOW';
    const dir   = caseData.direction_after;

    const dirBadge = isNow
        ? { label: '진행중', color: 'rgba(255,255,255,0.3)', bg: 'rgba(255,255,255,0.07)' }
        : dir === 'UP'
            ? { label: '상승 ↑', color: UP_COLOR,   bg: 'rgba(0,232,135,0.1)' }
            : { label: '하락 ↓', color: DOWN_COLOR, bg: 'rgba(255,59,92,0.1)' };

    const dateLabel = isNow
        ? 'NOW'
        : (() => {
            const d = new Date(caseData.trigger_time);
            return `${d.getMonth() + 1}/${String(d.getDate()).padStart(2, '0')}`;
        })();

    return (
        <div
            onClick={() => {
                console.log(caseData.case_date, caseData.trigger_time);
                onClick?.();
            }}
            style={{
                minWidth: '160px',
                maxWidth: '180px',
                backgroundColor: isNow ? NOW_BG : CARD_BG,
                borderRadius: '6px',
                padding: '8px',
                border: `1px solid ${isNow ? NOW_BORDER : CARD_BORDER}`,
                cursor: 'pointer',
                flexShrink: 0,
                display: 'flex',
                flexDirection: 'column',
                gap: '6px',
            }}
        >
            {/* 카드 헤더 */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '12px', fontWeight: '700', color: 'rgba(255,255,255,0.8)', fontFamily: "'Pretendard', sans-serif" }}>
                    {dateLabel}
                </span>
                <span style={{
                    fontSize: '10px',
                    fontWeight: '600',
                    color: dirBadge.color,
                    backgroundColor: dirBadge.bg,
                    padding: '2px 6px',
                    borderRadius: '3px',
                    fontFamily: "'Pretendard', sans-serif",
                }}>
                    {dirBadge.label}
                </span>
            </div>

            {/* 미니 차트 */}
            <div style={{ flex: 1, minHeight: '80px' }}>
                <CaseChart
                    candles={caseData.candles}
                    triggerIdx={caseData.trigger_idx}
                    isNow={isNow}
                />
            </div>
        </div>
    );
}

// ─── 스켈레톤 ─────────────────────────────────────────────────────────────────

function SkeletonCard() {
    return (
        <div style={{
            minWidth: '160px',
            maxWidth: '180px',
            height: '120px',
            backgroundColor: 'rgba(255,255,255,0.04)',
            borderRadius: '6px',
            border: '1px solid rgba(255,255,255,0.04)',
            flexShrink: 0,
            animation: 'stripPulse 1.5s ease-in-out infinite',
        }} />
    );
}

// ─── Signal Score ──────────────────────────────────────────────────────────────

function SignalScore({ score }) {
    if (!score) return null;
    const { score_pct, dominant_dir, matched_count, total_count } = score;
    const color = scoreColor(score_pct);
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', minWidth: '120px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ flex: 1, height: '6px', backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: '3px', overflow: 'hidden' }}>
                    <div style={{ width: `${score_pct}%`, height: '100%', backgroundColor: color, borderRadius: '3px', transition: 'width 0.4s' }} />
                </div>
                <span style={{ fontSize: '12px', fontWeight: '700', color, fontFamily: "'Pretendard', sans-serif", minWidth: '40px' }}>
                    {score_pct.toFixed(1)}%
                </span>
            </div>
            <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.5)', fontFamily: "'Pretendard', sans-serif" }}>
                {dominant_dir === 'UP' ? '상승' : dominant_dir === 'DOWN' ? '하락' : dominant_dir} {matched_count}/{total_count}
            </div>
        </div>
    );
}

// ─── 메인 PatternStrip ─────────────────────────────────────────────────────────

export default function PatternStrip({ symbol, latestCandleTime, params }) {
    const [patternData, setPatternData] = useState(null); // {triggered, cases}
    const [score, setScore]             = useState(null);
    const [loading, setLoading]         = useState(false);
    const [error, setError]             = useState(false);
    const abortRef = useRef(null);

    const fetchPattern = useCallback(async () => {
        if (!symbol || !latestCandleTime) return;

        abortRef.current?.abort();
        abortRef.current = new AbortController();
        const sig = abortRef.current.signal;

        setLoading(true);
        setError(false);
        setScore(null);

        try {
            const res = await axios.get(
                `/api/signal/pattern?symbol=${symbol}&candle_time=${latestCandleTime}`,
                { signal: sig }
            );
            setPatternData(res.data);

            if (res.data.triggered) {
                try {
                    const scoreRes = await axios.get(
                        `/api/signal/score?symbol=${symbol}&candle_time=${latestCandleTime}`,
                        { signal: sig }
                    );
                    setScore(scoreRes.data);
                } catch (e) {
                    if (e.name !== 'CanceledError') setScore(null);
                }
            }
        } catch (e) {
            if (e.name !== 'CanceledError') setError(true);
        } finally {
            if (!sig.aborted) setLoading(false);
        }
    }, [symbol, latestCandleTime]);

    useEffect(() => {
        fetchPattern();
        return () => abortRef.current?.abort();
    }, [fetchPattern]);

    // params 변경 시 재조회 (useCallback 의존성 분리)
    useEffect(() => {
        if (params) fetchPattern();
    // fetchPattern은 symbol/latestCandleTime 변경 시 이미 실행되므로 제외
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [params]);

    const triggered = patternData?.triggered;
    const cases     = patternData?.cases ?? [];

    // 트리거 시간 표시
    const triggerTimeLabel = (() => {
        if (!latestCandleTime) return null;
        const d = new Date(latestCandleTime);
        return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
    })();

    return (
        <div
            style={{
                height: '100%',
                backgroundColor: '#0e0f18',
                borderRadius: '10px',
                padding: '12px 16px',
                border: '1px solid rgba(255,255,255,0.06)',
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
                overflow: 'hidden',
            }}
        >
            <style>{`
                @keyframes stripPulse {
                    0%, 100% { opacity: 0.5; }
                    50%       { opacity: 0.2; }
                }
            `}</style>

            {/* StripHeader — 항상 표시 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexShrink: 0 }}>
                {/* 세로 라벨 */}
                <div style={{
                    writingMode: 'vertical-rl',
                    fontSize: '11px',
                    color: 'rgba(255,255,255,0.3)',
                    letterSpacing: '1.5px',
                    fontFamily: "'Pretendard', sans-serif",
                    userSelect: 'none',
                    lineHeight: 1,
                }}>
                    유사 패턴
                </div>

                {/* Signal Score — triggered:true 일 때만 */}
                <div style={{ visibility: triggered ? 'visible' : 'hidden' }}>
                    <SignalScore score={score} />
                </div>

                <div style={{ flex: 1 }} />

                {/* 트리거 상태 배지 */}
                <div style={{
                    fontSize: '11px',
                    fontWeight: '600',
                    fontFamily: "'Pretendard', sans-serif",
                    padding: '4px 10px',
                    borderRadius: '4px',
                    border: `1px solid ${triggered ? 'rgba(0,232,135,0.3)' : 'rgba(255,255,255,0.1)'}`,
                    color: triggered ? SCORE_GREEN : 'rgba(255,255,255,0.35)',
                    backgroundColor: triggered ? 'rgba(0,232,135,0.07)' : 'transparent',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                }}>
                    <span style={{ fontSize: '7px' }}>{triggered ? '●' : '○'}</span>
                    {triggered
                        ? `트리거 발동${triggerTimeLabel ? ` ${triggerTimeLabel}` : ''}`
                        : '대기중'
                    }
                </div>
            </div>

            {/* StripCards — 상태별 분기 */}
            <div style={{ display: 'flex', flex: 1, overflow: 'hidden', visibility: triggered === false && !loading ? 'hidden' : 'visible' }}>
                {loading ? (
                    /* 스켈레톤 */
                    <div style={{ display: 'flex', gap: '10px', overflowX: 'auto' }}>
                        {Array.from({ length: 7 }).map((_, i) => <SkeletonCard key={i} />)}
                    </div>
                ) : error ? (
                    /* 오류 */
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px' }}>
                        <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)', fontFamily: "'Pretendard', sans-serif" }}>
                            데이터를 불러올 수 없습니다
                        </span>
                        <button
                            onClick={fetchPattern}
                            style={{
                                fontSize: '11px',
                                padding: '4px 10px',
                                borderRadius: '4px',
                                border: '1px solid rgba(255,255,255,0.2)',
                                background: 'transparent',
                                color: 'rgba(255,255,255,0.6)',
                                cursor: 'pointer',
                                fontFamily: "'Pretendard', sans-serif",
                            }}
                        >
                            재시도
                        </button>
                    </div>
                ) : triggered && cases.length === 0 ? (
                    /* 트리거 발동 + 사례 없음 */
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)', fontFamily: "'Pretendard', sans-serif" }}>
                            유사 사례를 찾을 수 없습니다
                        </span>
                    </div>
                ) : triggered && cases.length > 0 ? (
                    /* 카드 렌더링 */
                    <div style={{ display: 'flex', gap: '10px', overflowX: 'auto', flex: 1, paddingBottom: '2px' }}>
                        {cases.map((c, i) => (
                            <CaseCard key={c.case_date + i} caseData={c} />
                        ))}
                    </div>
                ) : null}
            </div>
        </div>
    );
}
