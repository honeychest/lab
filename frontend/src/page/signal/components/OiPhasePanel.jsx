const PHASE_META = {
    NEW_LONG: { label: '신규 롱', color: 'var(--black-long)', soft: false },
    SHORT_COVERING: { label: '숏 커버링', color: 'var(--black-long)', soft: true },
    NEW_SHORT: { label: '신규 숏', color: 'var(--black-short)', soft: false },
    LONG_LIQUIDATION: { label: '롱 청산', color: 'var(--black-short)', soft: true },
};

const GRADE_LABELS = {
    FLAT: '보합',
    WEAK: '약',
    MEDIUM: '중',
    STRONG: '강',
};

const PHASE_ORDER = ['NEW_LONG', 'SHORT_COVERING', 'NEW_SHORT', 'LONG_LIQUIDATION'];
const BASE_QUADRANT_RATIO = 0.25;

// 네 국면의 25% 기준선은 6개월 실측의 거의 균등한 분포에서 나온 측정값이며 예측값이 아니다.
const sectionStyle = {
    display: 'grid',
    gap: '4px',
    minWidth: 0,
};

const sectionTitleStyle = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    color: 'var(--black-text-secondary)',
    fontSize: '13px',
    fontWeight: '600',
};

const metaStyle = {
    color: 'var(--black-text-muted)',
    fontSize: '12px',
    fontWeight: '500',
};

function finiteNumber(value) {
    if (value == null || value === '') return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
}

function formatNumber(value, digits = 2) {
    const number = finiteNumber(value);
    if (number == null) return null;
    return number.toLocaleString('ko-KR', {
        maximumFractionDigits: digits,
    });
}

function formatSignedNumber(value) {
    const number = finiteNumber(value);
    if (number == null) return null;
    const formatted = formatNumber(Math.abs(number));
    return `${number > 0 ? '+' : number < 0 ? '-' : ''}${formatted}`;
}

function formatRatio(value) {
    const ratio = finiteNumber(value);
    return ratio == null ? null : `${(ratio * 100).toFixed(1)}%`;
}

function formatMultiplier(value) {
    const multiplier = finiteNumber(value);
    return multiplier == null ? null : `${multiplier.toFixed(2)}배`;
}

function formatDateTime(value) {
    const timestamp = finiteNumber(value);
    if (timestamp == null) return null;
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) return null;
    return date.toLocaleString('ko-KR', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    });
}

function formatDelay(value) {
    const delayMs = finiteNumber(value);
    if (delayMs == null) return null;
    const delayMinutes = delayMs / 60_000;
    if (!Number.isFinite(delayMinutes)) return null;
    return `${delayMinutes.toLocaleString('ko-KR', { maximumFractionDigits: 0 })}분 지연`;
}

function clampRatio(value) {
    const ratio = finiteNumber(value);
    if (ratio == null) return 0;
    return Math.max(0, Math.min(1, ratio));
}

function TiltSection({ tilt }) {
    if (!tilt) return null;

    const windowBars = finiteNumber(tilt.windowBars);
    const quadrantBarCount = finiteNumber(tilt.quadrantBarCount);

    return (
        <section style={sectionStyle} aria-label="OI 국면 쏠림">
            <div style={sectionTitleStyle}>
                <span>최근 쏠림</span>
                {(quadrantBarCount != null || windowBars != null) && (
                    <span style={metaStyle}>
                        표본 {quadrantBarCount ?? 0}/{windowBars ?? 0}
                    </span>
                )}
            </div>
            <div style={{ display: 'grid', gap: '3px' }}>
                {PHASE_ORDER.map((phase) => {
                    const meta = PHASE_META[phase];
                    const rawRatio = finiteNumber(tilt.quadrantRatios?.[phase]);
                    if (rawRatio == null) return null;

                    const ratio = clampRatio(rawRatio);
                    const count = finiteNumber(tilt.quadrantCounts?.[phase]);

                    return (
                        <div key={phase} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 2fr) minmax(0, 1.6fr)', gap: '4px', alignItems: 'center' }}>
                            <span style={{ color: 'var(--black-text-muted)', fontSize: '12px', whiteSpace: 'nowrap' }}>{meta.label}</span>
                            <div
                                role="progressbar"
                                aria-label={`${meta.label} 비율`}
                                aria-valuemin="0"
                                aria-valuemax="100"
                                aria-valuenow={ratio * 100}
                                style={{ height: '8px', backgroundColor: 'var(--black-border-subtle)', borderRadius: '2px', overflow: 'hidden' }}
                            >
                                <div style={{ width: `${ratio * 100}%`, height: '100%', backgroundColor: meta.color, opacity: meta.soft ? 0.5 : 1 }} />
                            </div>
                            <span style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                                <strong style={{ color: 'var(--black-text-primary)', fontSize: '15px', fontWeight: '700' }}>
                                    {formatRatio(ratio) ?? '데이터 없음'} ({(ratio / BASE_QUADRANT_RATIO).toFixed(2)}배)
                                </strong>
                                {count != null && <span style={{ color: 'var(--black-text-muted)', fontSize: '12px' }}> {count}건</span>}
                            </span>
                        </div>
                    );
                })}
            </div>
        </section>
    );
}

function getBandStyle(band) {
    const phase = PHASE_META[band?.representativePhase];
    const grade = band?.representativeGrade;
    const dominanceRatio = finiteNumber(band?.dominanceRatio);
    const hasStrongGrade = grade === 'MEDIUM' || grade === 'STRONG';
    const hasLongRangeDominance = grade == null && dominanceRatio != null;

    if (!phase || (!hasStrongGrade && !hasLongRangeDominance)) {
        return { backgroundColor: 'var(--black-border)' };
    }

    const intensity = dominanceRatio == null
        ? grade === 'STRONG' ? 1 : 0.7
        : Math.max(0.25, Math.min(1, dominanceRatio));

    return {
        backgroundColor: phase.color,
        opacity: phase.soft ? intensity * 0.55 : intensity,
    };
}

function getRepresentativeBarCount(bands) {
    const frequencies = new Map();

    bands.forEach((band) => {
        const barCount = finiteNumber(band?.barCount);
        if (barCount == null) return;
        frequencies.set(barCount, (frequencies.get(barCount) ?? 0) + 1);
    });

    return [...frequencies.entries()]
        .sort(([countA, frequencyA], [countB, frequencyB]) => frequencyB - frequencyA || countA - countB)[0]?.[0] ?? null;
}

function BandsSection({ bands }) {
    if (!Array.isArray(bands) || bands.length === 0) return null;

    const startAt = formatDateTime(bands[0]?.fromMs);
    const endAt = formatDateTime(bands[bands.length - 1]?.toMs);
    const representativeBarCount = getRepresentativeBarCount(bands);
    const representativeMinutes = representativeBarCount == null ? null : representativeBarCount * 5;

    return (
        <section style={sectionStyle} aria-label="OI 국면 띠">
            <div style={sectionTitleStyle}>
                <span>국면 띠</span>
                <span style={metaStyle}>강도 반영</span>
            </div>
            <div style={{ display: 'flex', gap: '1px', width: '100%', height: '18px' }}>
                {bands.map((band, index) => {
                    const barCount = Math.max(1, finiteNumber(band.barCount) ?? 1);
                    const phaseLabel = PHASE_META[band.representativePhase]?.label;
                    const gradeLabel = GRADE_LABELS[band.representativeGrade];

                    return (
                        <span
                            key={`${band.fromMs ?? 'band'}-${band.toMs ?? index}`}
                            title={[phaseLabel, gradeLabel, band.dominanceRatio != null ? formatRatio(band.dominanceRatio) : null].filter(Boolean).join(' ')}
                            style={{ ...getBandStyle(band), flex: `${barCount} 1 0%`, minWidth: 0, borderRadius: '1px' }}
                        />
                    );
                })}
            </div>
            <div style={{ ...metaStyle, display: 'flex', justifyContent: 'space-between', gap: '4px', flexWrap: 'wrap' }}>
                <span>{startAt ? `시작 ${startAt}` : '시작 -'} {endAt ? `끝 ${endAt}` : '끝 -'}</span>
                {representativeMinutes != null && <span>대표 칸당 {formatNumber(representativeMinutes, 0)}분</span>}
            </div>
        </section>
    );
}

function LatestSection({ latest, confirmationDelayMs }) {
    if (!latest) return null;

    const gradeLabel = GRADE_LABELS[latest.grade];
    const phaseLabel = PHASE_META[latest.phase]?.label;
    const isFlat = latest.status !== 'CONFIRMED' || latest.grade === 'FLAT';
    const label = isFlat
        ? '보합 - 판정 없음'
        : [phaseLabel, gradeLabel].filter(Boolean).join(' ');
    const confirmedAt = formatDateTime(latest.candleTimeMs);
    const delay = formatDelay(confirmationDelayMs);
    const delta = formatSignedNumber(latest.delta);
    const deltaOi = formatSignedNumber(latest.deltaOi);
    const deltaMultiplier = formatMultiplier(latest.deltaMultiplier);
    const deltaOiMultiplier = formatMultiplier(latest.deltaOiMultiplier);

    return (
        <section style={{ ...sectionStyle, borderTop: '1px solid var(--black-border-subtle)', paddingTop: '4px' }} aria-label="최신 확정 OI 국면">
            <div style={sectionTitleStyle}>
                <span>최신 확정 봉</span>
                <strong style={{ color: isFlat ? 'var(--black-text-muted)' : 'var(--black-text-primary)', fontSize: '15px', fontWeight: '700' }}>{label || '판정 없음'}</strong>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px 8px', color: 'var(--black-text-muted)', fontSize: '12px' }}>
                {delta != null && <span>FUTURES Δ {delta}</span>}
                {deltaOi != null && <span>ΔOI {deltaOi}</span>}
                {(deltaMultiplier != null || deltaOiMultiplier != null) && (
                    <span>배수 {deltaMultiplier ?? '-'} / {deltaOiMultiplier ?? '-'}</span>
                )}
            </div>
            {(confirmedAt || delay) && (
                <div style={metaStyle}>
                    {confirmedAt ? `확정 시각 ${confirmedAt}` : ''}{confirmedAt && delay ? ' ' : ''}{delay ?? ''}
                </div>
            )}
        </section>
    );
}

function CumulativeSection({ cumulativeDeltaOi }) {
    if (!cumulativeDeltaOi) return null;

    const value = formatSignedNumber(cumulativeDeltaOi.value);
    const anchor = formatDateTime(cumulativeDeltaOi.anchorFromMs);
    const validBarCount = finiteNumber(cumulativeDeltaOi.validBarCount);

    return (
        <section style={{ ...sectionStyle, border: '1px solid var(--black-border-subtle)', borderRadius: '4px', padding: '4px 6px' }} aria-label="앵커부터 누적 ΔOI">
            <div style={sectionTitleStyle}>
                <span>누적 ΔOI</span>
                {anchor && <span style={metaStyle}>앵커 {anchor}</span>}
            </div>
            {value != null && <strong style={{ color: 'var(--black-text-primary)', fontSize: '15px', lineHeight: 1.1 }}>{value}</strong>}
            {validBarCount != null && <span style={metaStyle}>유효 봉 {validBarCount}개</span>}
        </section>
    );
}

function formatPercent(value, digits = 1) {
    const number = finiteNumber(value);
    if (number == null) return null;
    const formatted = Math.abs(number).toLocaleString('ko-KR', {
        maximumFractionDigits: digits,
    });
    return `${number > 0 ? '+' : number < 0 ? '-' : ''}${formatted}%`;
}

function UnwindSection({ unwind }) {
    if (!unwind) return null;

    const current = unwind.current;
    const history = unwind.history ?? {};
    const episodeCount = finiteNumber(history.episodeCount);
    const hasHistory = (episodeCount ?? 0) > 0 || history.sampleFromMs != null || history.sampleToMs != null;
    if (!current && !hasHistory) return null;

    const median3d = formatPercent(history.medianDrawdown3d);
    const median7d = formatPercent(history.medianDrawdown7d);
    const over5pct = finiteNumber(history.over5pctWithin7d);
    const peakOi = formatNumber(current?.peakOi, 0);
    const peakAt = formatDateTime(current?.peakTimeMs);
    const drawdown = formatPercent(current?.drawdownPct, 2);
    const elapsedHours = formatNumber(current?.elapsedHours, 1);

    const historyLine = [
        `과거 ${episodeCount ?? 0}건`,
        median3d ? `3일 중앙 ${median3d} (물량)` : '3일 중앙 -',
        median7d ? `7일 중앙 ${median7d} (물량)` : '7일 중앙 -',
        over5pct != null ? `7일 내 물량 5% 이상 감소 ${over5pct}건` : '7일 내 물량 5% 이상 감소 -',
    ].join(' / ');

    return (
        <section
            style={{ ...sectionStyle, gridColumn: '1 / -1', borderTop: '1px solid var(--black-border-subtle)', paddingTop: '4px' }}
            aria-label="OI 해소 진행도"
        >
            <div style={sectionTitleStyle}>
                <span>OI 해소 진행도</span>
                <span style={metaStyle}>BTC 기준 물량</span>
            </div>
            {current && (peakOi || peakAt || drawdown || elapsedHours) && (
                <div style={{ color: 'var(--black-text-primary)', fontSize: '15px', fontWeight: '700', lineHeight: 1.2 }}>
                    {peakOi ? `고점 ${peakOi}` : '고점 -'}{peakAt ? ` (${peakAt})` : ''}
                    {drawdown ? ` 이후 ${drawdown} (물량)` : ' 이후 데이터 없음'}
                    {elapsedHours ? ` / ${elapsedHours}시간 경과` : ''}
                </div>
            )}
            <div style={{ ...metaStyle, lineHeight: 1.35 }}>{historyLine}</div>
            <div style={metaStyle}>
                {current?.observationCompleted === false
                    ? '현재 진행 중인 에피소드는 7일 관찰 전이라 과거 통계에서 제외'
                    : '과거 통계는 7일 관찰이 끝난 에피소드만 포함'}
            </div>
        </section>
    );
}

export default function OiPhasePanel({ data }) {
    if (!data) return null;

    const hasUnwind = data.oiUnwind?.current || finiteNumber(data.oiUnwind?.history?.episodeCount) > 0;
    const hasContent = data.cumulativeDeltaOi || data.tilt || (Array.isArray(data.bands) && data.bands.length > 0) || data.latest || hasUnwind;
    if (!hasContent) return null;

    return (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.2fr) minmax(0, 3fr) minmax(0, 1.5fr)', gap: '10px', minWidth: 0, minHeight: 0, height: '100%', boxSizing: 'border-box', padding: '10px', backgroundColor: 'var(--black-panel-bg)', borderRadius: '10px', border: '1px solid var(--black-border)', fontFamily: "'Pretendard', sans-serif" }}>
            <div style={{ ...sectionStyle, alignContent: 'start', minHeight: 0 }}>
                <LatestSection latest={data.latest} confirmationDelayMs={data.confirmationDelayMs} />
                <CumulativeSection cumulativeDeltaOi={data.cumulativeDeltaOi} />
            </div>
            <div style={{ ...sectionStyle, alignContent: 'start', minHeight: 0 }}>
                <BandsSection bands={data.bands} />
            </div>
            <div style={{ ...sectionStyle, alignContent: 'start', minHeight: 0 }}>
                <TiltSection tilt={data.tilt} />
            </div>
            <UnwindSection unwind={data.oiUnwind} />
        </div>
    );
}

/*
## 실행 결과

1. `finiteNumber` 수정 내용
- `null`, `undefined`, 빈 문자열을 `Number()` 호출 전에 `null`로 반환하도록 수정했다.
- 숫자 0은 기존처럼 유효한 값으로 유지한다.

2. 호출부 점검 결과
- 이 파일에서 정의 1곳과 호출 13곳을 확인했다. 의뢰서의 14곳은 정의를 포함한 개수로 해석했다.
- `formatDateTime(null)`은 1970년 1월 1일 대신 표시하지 않고, `formatMultiplier(null)`은 `0.00배` 대신 표시하지 않는다.
- `validBarCount`, `quadrantCounts`, 표본 수처럼 결측값을 표시하면 안 되는 곳은 `null`로 남아 표시를 생략한다.
- `band.barCount`는 결측 시 1로, `clampRatio`는 결측 시 0으로 처리하는 기존 명시적 기본값을 유지했다.
- `dominanceRatio` 결측 시 등급 기반 강도 분기와 `quadrantRatios` 결측 시 행 생략이 정상적으로 도달한다.

3. 띠 시각 축
- 첫 구간의 `fromMs`를 시작 시각으로, 마지막 구간의 `toMs`를 끝 시각으로 기존 `formatDateTime`을 사용해 표시한다.
- `barCount`의 최빈값을 대표값으로 삼아 `대표 칸당 N분`을 표시한다.

4. 띠 높이
- 8px에서 18px로 변경했다.
- 패널의 200px 높이 제한 안에서 색 구간을 식별할 수 있도록 높이를 늘리고, 기존 레이아웃의 여유를 넘지 않도록 18px로 정했다.

5. 검증
- `npm run test`: 통과, Test Files 3 passed, Tests 9 passed.
- `npm run build`: 통과. `lottie-web`의 `eval` 경고와 500 kB 초과 청크 경고가 출력됐지만 빌드는 성공했다.
- 화면 확인은 하지 않았다.

6. `git status --short`
```text
 M AGENTS.md
 M CLAUDE.md
 M docs/HANDOFF.md
 M frontend/src/page/signal/SignalPage.jsx
 M frontend/src/page/signal/components/EnergyDiff.jsx
 M frontend/src/page/signal/components/MainCore.jsx
 M frontend/src/page/signal/model/signalRuntimeModel.js
 M frontend/src/page/signal/model/signalRuntimeModel.test.mjs
 M springboot/src/main/java/com/chs/springboot/domain/binance/controller/SignalController.java
 M springboot/src/main/java/com/chs/springboot/domain/binance/repository/AggTrade1mRepository.java
 M springboot/src/main/java/com/chs/springboot/domain/binance/repository/AggTrade5mRepository.java
 M springboot/src/main/java/com/chs/springboot/domain/binance/service/BinanceKlineSignalCandleSource.java
 M springboot/src/main/java/com/chs/springboot/domain/binance/service/SignalCandleSource.java
 M springboot/src/main/java/com/chs/springboot/domain/binance/service/SignalDataService.java
 M springboot/src/main/resources/application.properties
 M springboot/src/test/java/com/chs/springboot/domain/binance/service/BinanceKlineSignalCandleSourceTest.java
 M springboot/src/test/java/com/chs/springboot/domain/binance/service/SignalDataServiceTest.java
?? docs/binance/oi-phase-panel-plan.md
?? frontend/src/page/signal/components/OiPhasePanel.jsx
?? springboot/src/main/java/com/chs/springboot/domain/binance/service/OpenInterestPhaseService.java
?? springboot/src/test/java/com/chs/springboot/domain/binance/service/OpenInterestPhaseServiceTest.java
?? tradingview/
```
*/
