package com.chs.springboot.domain.binance.service;

import com.chs.springboot.domain.binance.model.AggTrade5m;
import com.chs.springboot.domain.binance.model.BinanceKline5m;
import com.chs.springboot.domain.binance.model.OpenInterest;
import com.chs.springboot.domain.binance.repository.AggTrade5mRepository;
import com.chs.springboot.domain.binance.repository.BinanceKline5mRepository;
import com.chs.springboot.domain.binance.repository.OpenInterestRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.MathContext;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.TreeMap;

/**
 * OI와 선물 전용 5분 delta를 시각으로 조인해 국면 패널 데이터를 계산한다.
 * DB에는 조회만 수행하고, 등급·국면·띠·쏠림은 메모리의 순수 계산으로 만든다.
 */
@Service
public class OpenInterestPhaseService {

    private static final long FIVE_MINUTE_MS = 300_000L;
    private static final long ONE_DAY_MS = 86_400_000L;
    private static final long THREE_DAY_MS = 3 * ONE_DAY_MS;
    private static final long ONE_HOUR_MS = 3_600_000L;
    private static final int MAX_SHORT_BAND_BARS = 12;
    private static final MathContext CALCULATION_CONTEXT = MathContext.DECIMAL128;
    private static final BigDecimal PERCENT = BigDecimal.valueOf(100);
    private static final BigDecimal FIVE_PERCENT_DRAWDOWN = BigDecimal.valueOf(-5);

    private final OpenInterestRepository openInterestRepository;
    private final AggTrade5mRepository aggTrade5mRepository;
    private final BinanceKline5mRepository kline5mRepository;
    private final long legacyCutoverMs;
    private final int rollingWindowBars;
    private final long tiltMinRangeMs;
    private final int bandTargetCount;
    private final BigDecimal deltaOiP50;
    private final BigDecimal deltaOiP80;
    private final BigDecimal deltaOiP95;
    private final BigDecimal futuresDeltaP50;
    private final BigDecimal futuresDeltaP80;
    private final BigDecimal futuresDeltaP95;
    private final int unwindLookbackBars;
    private final long unwindMergeWindowMs;
    private final int unwindObservationBars;
    private final Map<String, CachedUnwindHistory> unwindHistoryCache = new HashMap<>();

    public OpenInterestPhaseService(
            OpenInterestRepository openInterestRepository,
            AggTrade5mRepository aggTrade5mRepository,
            BinanceKline5mRepository kline5mRepository,
            @Value("${binance.agg-trade.legacy-cutover-ms}") long legacyCutoverMs,
            @Value("${binance.oi-phase.rolling-window-bars}") int rollingWindowBars,
            @Value("${binance.oi-phase.tilt-min-range-ms}") long tiltMinRangeMs,
            @Value("${binance.oi-phase.band-target-count}") int bandTargetCount,
            @Value("${binance.oi-phase.grade.delta-oi.p50}") BigDecimal deltaOiP50,
            @Value("${binance.oi-phase.grade.delta-oi.p80}") BigDecimal deltaOiP80,
            @Value("${binance.oi-phase.grade.delta-oi.p95}") BigDecimal deltaOiP95,
            @Value("${binance.oi-phase.grade.futures-delta.p50}") BigDecimal futuresDeltaP50,
            @Value("${binance.oi-phase.grade.futures-delta.p80}") BigDecimal futuresDeltaP80,
            @Value("${binance.oi-phase.grade.futures-delta.p95}") BigDecimal futuresDeltaP95,
            @Value("${binance.oi-unwind.lookback-bars}") int unwindLookbackBars,
            @Value("${binance.oi-unwind.merge-window-ms}") long unwindMergeWindowMs,
            @Value("${binance.oi-unwind.observation-bars}") int unwindObservationBars) {
        this.openInterestRepository = openInterestRepository;
        this.aggTrade5mRepository = aggTrade5mRepository;
        this.kline5mRepository = kline5mRepository;
        this.legacyCutoverMs = legacyCutoverMs;
        this.rollingWindowBars = rollingWindowBars;
        this.tiltMinRangeMs = tiltMinRangeMs;
        this.bandTargetCount = bandTargetCount;
        this.deltaOiP50 = deltaOiP50;
        this.deltaOiP80 = deltaOiP80;
        this.deltaOiP95 = deltaOiP95;
        this.futuresDeltaP50 = futuresDeltaP50;
        this.futuresDeltaP80 = futuresDeltaP80;
        this.futuresDeltaP95 = futuresDeltaP95;
        this.unwindLookbackBars = unwindLookbackBars;
        this.unwindMergeWindowMs = unwindMergeWindowMs;
        this.unwindObservationBars = unwindObservationBars;
    }

    public Map<String, Object> getPhases(
            String symbol,
            long requestedFromMs,
            long toMsExclusive,
            boolean anchoredRange) {
        long queryFromMs = Math.floorDiv(requestedFromMs, FIVE_MINUTE_MS) * FIVE_MINUTE_MS;
        long warmupFromMs = queryFromMs - rollingWindowBars * FIVE_MINUTE_MS;
        long oiToMsInclusive = toMsExclusive + FIVE_MINUTE_MS;

        List<OpenInterest> oiRows = openInterestRepository
                .findBySymbolAndCollectedAtMsBetweenOrderByCollectedAtMsAsc(
                        symbol, warmupFromMs, oiToMsInclusive);
        Map<Long, BigDecimal> oiByTime = new HashMap<>();
        int droppedOffGridOiRows = 0;
        for (OpenInterest oi : oiRows) {
            Long collectedAtMs = oi.getCollectedAtMs();
            if (collectedAtMs == null || collectedAtMs % FIVE_MINUTE_MS != 0) {
                droppedOffGridOiRows++;
                continue;
            }
            oiByTime.put(collectedAtMs, oi.getOpenInterest());
        }

        List<SourceBar> sourceBars = loadFuturesBars(symbol, warmupFromMs, toMsExclusive);
        Map<Long, SourceBar> sourceByTime = new TreeMap<>();
        for (SourceBar sourceBar : sourceBars) {
            sourceByTime.put(sourceBar.timeMs(), sourceBar);
        }

        List<SourceBar> sortedSourceBars = new ArrayList<>(sourceByTime.values());
        List<JoinedBar> joinedBars = new ArrayList<>();
        Map<Long, JoinedBar> joinedByTime = new HashMap<>();
        int skippedMissingPairs = 0;
        for (SourceBar sourceBar : sortedSourceBars) {
            BigDecimal startOi = oiByTime.get(sourceBar.timeMs());
            BigDecimal endOi = oiByTime.get(sourceBar.timeMs() + FIVE_MINUTE_MS);
            if (startOi == null || endOi == null) {
                skippedMissingPairs++;
                continue;
            }
            JoinedBar joinedBar = new JoinedBar(
                    sourceBar,
                    endOi.subtract(startOi));
            joinedBars.add(joinedBar);
            joinedByTime.put(sourceBar.timeMs(), joinedBar);
        }

        Map<Long, GradedBar> gradedByTime = new HashMap<>();
        int warmupExcludedBars = 0;
        int skippedZeroBaselineWindows = 0;
        for (int index = 0; index < joinedBars.size(); index++) {
            JoinedBar joinedBar = joinedBars.get(index);
            if (!isRequested(joinedBar.timeMs(), requestedFromMs, toMsExclusive)) {
                continue;
            }
            if (!hasContiguousWarmup(joinedBars, index)) {
                warmupExcludedBars++;
                continue;
            }

            Baselines baselines = baselines(joinedBars, index);
            if (baselines.deltaOi().signum() == 0 || baselines.futuresDelta().signum() == 0) {
                skippedZeroBaselineWindows++;
                continue;
            }

            BigDecimal deltaOiMultiplier = joinedBar.deltaOi().abs()
                    .divide(baselines.deltaOi(), CALCULATION_CONTEXT);
            BigDecimal futuresDeltaMultiplier = joinedBar.futuresDelta().abs()
                    .divide(baselines.futuresDelta(), CALCULATION_CONTEXT);
            GradeLevel deltaOiGrade = grade(deltaOiMultiplier, deltaOiP50, deltaOiP80, deltaOiP95);
            GradeLevel futuresDeltaGrade = grade(
                    futuresDeltaMultiplier, futuresDeltaP50, futuresDeltaP80, futuresDeltaP95);
            GradeLevel combinedGrade = deltaOiGrade.level <= futuresDeltaGrade.level
                    ? deltaOiGrade : futuresDeltaGrade;
            String phase = combinedGrade == GradeLevel.FLAT
                    ? null
                    : phase(joinedBar.futuresDelta(), joinedBar.deltaOi());
            gradedByTime.put(joinedBar.timeMs(), new GradedBar(
                    joinedBar,
                    combinedGrade,
                    phase,
                    futuresDeltaMultiplier,
                    deltaOiMultiplier));
        }

        long bandToMsExclusive = anchoredRange
                ? toMsExclusive
                : Math.floorDiv(toMsExclusive, FIVE_MINUTE_MS) * FIVE_MINUTE_MS;
        if (bandToMsExclusive <= requestedFromMs) {
            bandToMsExclusive = toMsExclusive;
        }
        long bandDurationMs = bandDuration(requestedFromMs, bandToMsExclusive, anchoredRange);
        List<Map<String, Object>> bands = buildBands(
                requestedFromMs, bandToMsExclusive, bandDurationMs, gradedByTime);

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("symbol", symbol);
        result.put("marketScope", "OI+FUTURES_DELTA");
        result.put("latestConfirmedCandleTimeMs", latestConfirmedTime(
                joinedBars, requestedFromMs, toMsExclusive));
        result.put("confirmationDelayMs", FIVE_MINUTE_MS);
        result.put("latest", latest(
                sortedSourceBars, joinedByTime, gradedByTime, requestedFromMs, toMsExclusive));
        result.put("bands", bands);
        result.put("tilt", buildTilt(gradedByTime, requestedFromMs, toMsExclusive));
        result.put("cumulativeDeltaOi", anchoredRange
                ? cumulativeDeltaOi(joinedBars, requestedFromMs, toMsExclusive)
                : null);
        result.put("oiUnwind", buildOiUnwind(symbol));

        Map<String, Object> quality = new LinkedHashMap<>();
        quality.put("droppedOffGridOiRows", droppedOffGridOiRows);
        quality.put("skippedMissingPairs", skippedMissingPairs);
        quality.put("warmupExcludedBars", warmupExcludedBars);
        quality.put("skippedZeroBaselineWindows", skippedZeroBaselineWindows);
        quality.put("sourceBoundary", sourceBoundary());
        result.put("quality", quality);
        return result;
    }

    private Map<String, Object> buildOiUnwind(String symbol) {
        long cacheDay = Math.floorDiv(System.currentTimeMillis(), ONE_DAY_MS);
        CachedUnwindHistory cachedHistory = getCachedUnwindHistory(symbol, cacheDay);
        List<OiPoint> recentOiPoints = loadRecentOiPoints(symbol);

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("current", findCurrentUnwind(recentOiPoints));
        result.put("history", historyResponse(cachedHistory.statistics()));
        return result;
    }

    private synchronized CachedUnwindHistory getCachedUnwindHistory(String symbol, long cacheDay) {
        CachedUnwindHistory cached = unwindHistoryCache.get(symbol);
        if (cached != null && cached.cacheDay() == cacheDay) {
            return cached;
        }

        Optional<Long> minTime = openInterestRepository.findMinCollectedAtMsBySymbol(symbol);
        Optional<Long> maxTime = openInterestRepository.findMaxCollectedAtMsBySymbol(symbol);
        if (minTime.isEmpty() || maxTime.isEmpty() || minTime.get() > maxTime.get()) {
            CachedUnwindHistory empty = new CachedUnwindHistory(cacheDay, emptyHistory());
            unwindHistoryCache.put(symbol, empty);
            return empty;
        }

        List<OiPoint> points = loadOiPoints(symbol, minTime.get(), maxTime.get());
        List<UnwindEpisode> episodes = detectUnwindEpisodes(points);
        Long sampleFromMs = points.size() > unwindLookbackBars
                ? points.get(unwindLookbackBars).timeMs()
                : null;
        Long sampleToMs = points.isEmpty() ? null : points.get(points.size() - 1).timeMs();
        HistoryStatistics statistics = buildHistoryStatistics(
                episodes,
                points,
                sampleFromMs,
                sampleToMs);
        CachedUnwindHistory refreshed = new CachedUnwindHistory(cacheDay, statistics);
        unwindHistoryCache.put(symbol, refreshed);
        return refreshed;
    }

    private HistoryStatistics emptyHistory() {
        return new HistoryStatistics(0, null, null, 0, null, null);
    }

    private List<OiPoint> loadRecentOiPoints(String symbol) {
        Optional<Long> latestTime = openInterestRepository.findMaxCollectedAtMsBySymbol(symbol);
        if (latestTime.isEmpty()) {
            return List.of();
        }

        long recentWindowMs = (long) unwindLookbackBars * FIVE_MINUTE_MS * 2 + unwindMergeWindowMs;
        long fromMs = latestTime.get() - recentWindowMs;
        return loadOiPoints(symbol, fromMs, latestTime.get());
    }

    private List<OiPoint> loadOiPoints(String symbol, long fromMs, long toMsInclusive) {
        Map<Long, BigDecimal> oiByTime = new TreeMap<>();
        for (OpenInterest oi : openInterestRepository
                .findBySymbolAndCollectedAtMsBetweenOrderByCollectedAtMsAsc(symbol, fromMs, toMsInclusive)) {
            Long collectedAtMs = oi.getCollectedAtMs();
            BigDecimal openInterest = oi.getOpenInterest();
            if (collectedAtMs == null
                    || collectedAtMs % FIVE_MINUTE_MS != 0
                    || openInterest == null) {
                continue;
            }
            oiByTime.put(collectedAtMs, openInterest);
        }
        return oiByTime.entrySet().stream()
                .map(entry -> new OiPoint(entry.getKey(), entry.getValue()))
                .toList();
    }

    private List<UnwindEpisode> detectUnwindEpisodes(List<OiPoint> points) {
        List<OiPoint> candidates = new ArrayList<>();
        for (int index = unwindLookbackBars; index < points.size(); index++) {
            int windowFrom = index - unwindLookbackBars;
            if (!hasContiguousOiWindow(points, windowFrom, index)) {
                continue;
            }

            BigDecimal previousHigh = points.get(windowFrom).openInterest();
            for (int previousIndex = windowFrom + 1; previousIndex < index; previousIndex++) {
                previousHigh = previousHigh.max(points.get(previousIndex).openInterest());
            }
            if (points.get(index).openInterest().compareTo(previousHigh) > 0) {
                candidates.add(points.get(index));
            }
        }

        List<UnwindEpisode> episodes = new ArrayList<>();
        for (OiPoint candidate : candidates) {
            if (episodes.isEmpty()
                    || candidate.timeMs() - episodes.get(episodes.size() - 1).lastCandidateTimeMs()
                    > unwindMergeWindowMs) {
                episodes.add(new UnwindEpisode(candidate, candidate.timeMs()));
                continue;
            }

            int lastIndex = episodes.size() - 1;
            UnwindEpisode previous = episodes.get(lastIndex);
            OiPoint peak = previous.peak().openInterest().compareTo(candidate.openInterest()) >= 0
                    ? previous.peak()
                    : candidate;
            episodes.set(lastIndex, new UnwindEpisode(peak, candidate.timeMs()));
        }
        return episodes;
    }

    private boolean hasContiguousOiWindow(List<OiPoint> points, int fromIndex, int toIndex) {
        for (int index = fromIndex + 1; index <= toIndex; index++) {
            if (points.get(index).timeMs() - points.get(index - 1).timeMs() != FIVE_MINUTE_MS) {
                return false;
            }
        }
        return true;
    }

    private Map<String, Object> findCurrentUnwind(List<OiPoint> recentOiPoints) {
        if (recentOiPoints.isEmpty()) {
            return null;
        }

        long latestTimeMs = recentOiPoints.get(recentOiPoints.size() - 1).timeMs();
        List<UnwindEpisode> episodes = detectUnwindEpisodes(recentOiPoints);
        for (int index = episodes.size() - 1; index >= 0; index--) {
            UnwindEpisode episode = episodes.get(index);
            long observationEndMs = episode.peak().timeMs()
                    + (long) unwindObservationBars * FIVE_MINUTE_MS;
            if (latestTimeMs >= observationEndMs) {
                continue;
            }

            BigDecimal currentOi = recentOiPoints.get(recentOiPoints.size() - 1).openInterest();
            Map<String, Object> current = new LinkedHashMap<>();
            current.put("peakTimeMs", episode.peak().timeMs());
            current.put("peakOi", episode.peak().openInterest().doubleValue());
            current.put("currentOi", currentOi.doubleValue());
            current.put("drawdownPct", drawdownPct(episode.peak().openInterest(), currentOi).doubleValue());
            current.put("elapsedHours", BigDecimal.valueOf(latestTimeMs - episode.peak().timeMs())
                    .divide(BigDecimal.valueOf(ONE_HOUR_MS), CALCULATION_CONTEXT)
                    .doubleValue());
            current.put("observationCompleted", false);
            return current;
        }
        return null;
    }

    private HistoryStatistics buildHistoryStatistics(
            List<UnwindEpisode> episodes,
            List<OiPoint> points,
            Long sampleFromMs,
            Long sampleToMs) {
        List<BigDecimal> drawdowns3d = new ArrayList<>();
        List<BigDecimal> drawdowns7d = new ArrayList<>();
        int over5pctWithin7d = 0;
        long latestTimeMs = sampleToMs == null ? Long.MIN_VALUE : sampleToMs;

        for (UnwindEpisode episode : episodes) {
            long sevenDayEndMs = episode.peak().timeMs()
                    + (long) unwindObservationBars * FIVE_MINUTE_MS;
            if (latestTimeMs < sevenDayEndMs) {
                continue;
            }

            BigDecimal minimum3d = minimumOiAfterPeak(
                    points, episode.peak().timeMs(), episode.peak().timeMs() + THREE_DAY_MS);
            BigDecimal minimum7d = minimumOiAfterPeak(
                    points, episode.peak().timeMs(), sevenDayEndMs);
            if (minimum3d == null || minimum7d == null) {
                continue;
            }

            BigDecimal drawdown3d = drawdownPct(episode.peak().openInterest(), minimum3d);
            BigDecimal drawdown7d = drawdownPct(episode.peak().openInterest(), minimum7d);
            drawdowns3d.add(drawdown3d);
            drawdowns7d.add(drawdown7d);
            if (drawdown7d.compareTo(FIVE_PERCENT_DRAWDOWN) <= 0) {
                over5pctWithin7d++;
            }
        }

        return new HistoryStatistics(
                drawdowns7d.size(),
                median(drawdowns3d),
                median(drawdowns7d),
                over5pctWithin7d,
                sampleFromMs,
                sampleToMs);
    }

    private BigDecimal minimumOiAfterPeak(List<OiPoint> points, long peakTimeMs, long endTimeMs) {
        BigDecimal minimum = null;
        for (OiPoint point : points) {
            if (point.timeMs() <= peakTimeMs || point.timeMs() > endTimeMs) {
                continue;
            }
            minimum = minimum == null ? point.openInterest() : minimum.min(point.openInterest());
        }
        return minimum;
    }

    private BigDecimal drawdownPct(BigDecimal peakOi, BigDecimal currentOi) {
        return currentOi.subtract(peakOi)
                .divide(peakOi, CALCULATION_CONTEXT)
                .multiply(PERCENT, CALCULATION_CONTEXT);
    }

    private BigDecimal median(List<BigDecimal> values) {
        if (values.isEmpty()) {
            return null;
        }
        List<BigDecimal> sorted = new ArrayList<>(values);
        sorted.sort(BigDecimal::compareTo);
        int middle = sorted.size() / 2;
        if (sorted.size() % 2 == 1) {
            return sorted.get(middle);
        }
        return sorted.get(middle - 1)
                .add(sorted.get(middle))
                .divide(BigDecimal.valueOf(2), CALCULATION_CONTEXT);
    }

    private Map<String, Object> historyResponse(HistoryStatistics statistics) {
        Map<String, Object> history = new LinkedHashMap<>();
        history.put("episodeCount", statistics.episodeCount());
        history.put("medianDrawdown3d", toDouble(statistics.medianDrawdown3d()));
        history.put("medianDrawdown7d", toDouble(statistics.medianDrawdown7d()));
        history.put("over5pctWithin7d", statistics.over5pctWithin7d());
        history.put("sampleFromMs", statistics.sampleFromMs());
        history.put("sampleToMs", statistics.sampleToMs());
        return history;
    }

    private Double toDouble(BigDecimal value) {
        return value == null ? null : value.doubleValue();
    }

    private List<SourceBar> loadFuturesBars(String symbol, long fromMs, long toMsExclusive) {
        long legacyEndMs = legacyEndMs();
        Map<Long, SourceBar> result = new TreeMap<>();
        long legacyToMs = Math.min(toMsExclusive, legacyEndMs);
        if (fromMs < legacyToMs) {
            for (AggTrade5m candle : aggTrade5mRepository
                    .findCandlesBySymbolAndMarketTypeAndTimeRange(
                            symbol, "FUTURES", fromMs, legacyToMs)) {
                result.put(candle.getCandleTimeMs(), new SourceBar(
                        candle.getCandleTimeMs(), candle.getDelta()));
            }
        }

        long canonicalFromMs = Math.max(fromMs, legacyEndMs);
        if (canonicalFromMs < toMsExclusive) {
            for (BinanceKline5m candle : kline5mRepository
                    .findBySymbolAndMarketTypeAndCandleTimeMsGreaterThanEqualAndCandleTimeMsLessThanOrderByCandleTimeMsAsc(
                            symbol, "FUTURES", canonicalFromMs, toMsExclusive)) {
                BigDecimal futuresDelta = candle.getTakerBuyBaseVolume()
                        .multiply(BigDecimal.valueOf(2))
                        .subtract(candle.getVolume());
                result.put(candle.getCandleTimeMs(), new SourceBar(
                        candle.getCandleTimeMs(), futuresDelta));
            }
        }
        return new ArrayList<>(result.values());
    }

    private Long latestConfirmedTime(
            List<JoinedBar> joinedBars,
            long requestedFromMs,
            long toMsExclusive) {
        return joinedBars.stream()
                .filter(bar -> isRequested(bar.timeMs(), requestedFromMs, toMsExclusive))
                .map(JoinedBar::timeMs)
                .max(Long::compareTo)
                .orElse(null);
    }

    private Map<String, Object> latest(
            List<SourceBar> sourceBars,
            Map<Long, JoinedBar> joinedByTime,
            Map<Long, GradedBar> gradedByTime,
            long requestedFromMs,
            long toMsExclusive) {
        SourceBar latestSource = sourceBars.stream()
                .filter(bar -> isRequested(bar.timeMs(), requestedFromMs, toMsExclusive))
                .max(Comparator.comparingLong(SourceBar::timeMs))
                .orElse(null);
        if (latestSource == null) {
            return null;
        }

        JoinedBar joinedBar = joinedByTime.get(latestSource.timeMs());
        GradedBar gradedBar = gradedByTime.get(latestSource.timeMs());
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("candleTimeMs", latestSource.timeMs());
        result.put("status", gradedBar == null ? "FLAT_UNCONFIRMED" : "CONFIRMED");
        result.put("phase", gradedBar == null ? null : gradedBar.phase());
        result.put("grade", gradedBar == null ? GradeLevel.FLAT.code : gradedBar.grade().code);
        result.put("delta", latestSource.futuresDelta().doubleValue());
        result.put("deltaOi", joinedBar == null ? null : joinedBar.deltaOi().doubleValue());
        result.put("deltaMultiplier", gradedBar == null
                ? null : gradedBar.futuresDeltaMultiplier().doubleValue());
        result.put("deltaOiMultiplier", gradedBar == null
                ? null : gradedBar.deltaOiMultiplier().doubleValue());
        return result;
    }

    private List<Map<String, Object>> buildBands(
            long fromMs,
            long toMsExclusive,
            long bandDurationMs,
            Map<Long, GradedBar> gradedByTime) {
        List<Map<String, Object>> result = new ArrayList<>();
        for (long bandFromMs = fromMs; bandFromMs < toMsExclusive; bandFromMs += bandDurationMs) {
            long bandToMs = Math.min(toMsExclusive, bandFromMs + bandDurationMs);
            long currentBandFromMs = bandFromMs;
            long currentBandToMs = bandToMs;
            List<GradedBar> bars = gradedByTime.values().stream()
                    .filter(bar -> bar.timeMs() >= currentBandFromMs && bar.timeMs() < currentBandToMs)
                    .sorted(Comparator.comparingLong(GradedBar::timeMs))
                    .toList();
            result.add(buildBand(bandFromMs, bandToMs, bars));
            if (bandToMs == toMsExclusive) {
                break;
            }
        }
        return result;
    }

    private Map<String, Object> buildBand(long fromMs, long toMs, List<GradedBar> bars) {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("fromMs", fromMs);
        result.put("toMs", toMs);
        result.put("barCount", bars.size());
        if (bars.isEmpty()) {
            result.put("representativePhase", null);
            result.put("representativeGrade", null);
            result.put("dominanceRatio", null);
            return result;
        }

        if (bars.size() <= MAX_SHORT_BAND_BARS) {
            GradedBar representative = bars.stream()
                    .max(Comparator.comparingInt(bar -> bar.grade().level))
                    .orElseThrow();
            result.put("representativePhase", representative.phase());
            result.put("representativeGrade", representative.grade().code);
            result.put("dominanceRatio", null);
            return result;
        }

        Map<String, Integer> phaseCounts = phaseCounts(bars);
        Map.Entry<String, Integer> dominant = phaseCounts.entrySet().stream()
                .max(Map.Entry.comparingByValue())
                .orElse(null);
        result.put("representativePhase", dominant == null ? null : dominant.getKey());
        result.put("representativeGrade", null);
        result.put("dominanceRatio", dominant == null
                ? null
                : dominant.getValue().doubleValue() / phaseCounts.values().stream()
                        .mapToInt(Integer::intValue).sum());
        return result;
    }

    private Map<String, Object> buildTilt(
            Map<Long, GradedBar> gradedByTime,
            long fromMs,
            long toMsExclusive) {
        List<GradedBar> bars = gradedByTime.values().stream()
                .filter(bar -> isRequested(bar.timeMs(), fromMs, toMsExclusive))
                .toList();
        if (toMsExclusive - fromMs < tiltMinRangeMs) {
            return null;
        }

        Map<String, Integer> counts = fullPhaseCounts(bars);
        int quadrantTotal = counts.values().stream().mapToInt(Integer::intValue).sum();
        Map<String, Double> ratios = new LinkedHashMap<>();
        for (String phase : List.of("NEW_LONG", "SHORT_COVERING", "NEW_SHORT", "LONG_LIQUIDATION")) {
            ratios.put(phase, quadrantTotal == 0 ? 0.0 : counts.getOrDefault(phase, 0).doubleValue() / quadrantTotal);
        }

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("windowBars", (toMsExclusive - fromMs) / FIVE_MINUTE_MS);
        result.put("gradedBarCount", bars.size());
        result.put("quadrantBarCount", quadrantTotal);
        result.put("quadrantCounts", counts);
        result.put("quadrantRatios", ratios);
        return result;
    }

    private Map<String, Integer> phaseCounts(List<GradedBar> bars) {
        Map<String, Integer> counts = new LinkedHashMap<>();
        for (GradedBar bar : bars) {
            if (bar.phase() != null) {
                counts.merge(bar.phase(), 1, Integer::sum);
            }
        }
        return counts;
    }

    private Map<String, Integer> fullPhaseCounts(List<GradedBar> bars) {
        Map<String, Integer> counts = new LinkedHashMap<>();
        for (String phase : List.of("NEW_LONG", "SHORT_COVERING", "NEW_SHORT", "LONG_LIQUIDATION")) {
            counts.put(phase, 0);
        }
        for (Map.Entry<String, Integer> entry : phaseCounts(bars).entrySet()) {
            counts.put(entry.getKey(), entry.getValue());
        }
        return counts;
    }

    private Map<String, Object> cumulativeDeltaOi(
            List<JoinedBar> joinedBars,
            long fromMs,
            long toMsExclusive) {
        BigDecimal value = BigDecimal.ZERO;
        int validBarCount = 0;
        for (JoinedBar bar : joinedBars) {
            if (isRequested(bar.timeMs(), fromMs, toMsExclusive)) {
                value = value.add(bar.deltaOi());
                validBarCount++;
            }
        }
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("anchorFromMs", fromMs);
        result.put("value", value.doubleValue());
        result.put("validBarCount", validBarCount);
        return result;
    }

    private Map<String, Object> sourceBoundary() {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("legacyCutoverMs", legacyCutoverMs);
        result.put("legacyEndMs", legacyEndMs());
        result.put("legacySource", "agg_trade_5m");
        result.put("canonicalSource", "binance_kline_5m");
        return result;
    }

    private Baselines baselines(List<JoinedBar> joinedBars, int index) {
        BigDecimal deltaOiSum = BigDecimal.ZERO;
        BigDecimal futuresDeltaSum = BigDecimal.ZERO;
        for (int offset = 1; offset <= rollingWindowBars; offset++) {
            JoinedBar previous = joinedBars.get(index - offset);
            deltaOiSum = deltaOiSum.add(previous.deltaOi().abs());
            futuresDeltaSum = futuresDeltaSum.add(previous.futuresDelta().abs());
        }
        BigDecimal divisor = BigDecimal.valueOf(rollingWindowBars);
        return new Baselines(
                deltaOiSum.divide(divisor, CALCULATION_CONTEXT),
                futuresDeltaSum.divide(divisor, CALCULATION_CONTEXT));
    }

    private boolean hasContiguousWarmup(List<JoinedBar> joinedBars, int index) {
        if (index < rollingWindowBars) {
            return false;
        }
        long currentTimeMs = joinedBars.get(index).timeMs();
        for (int offset = 1; offset <= rollingWindowBars; offset++) {
            if (joinedBars.get(index - offset).timeMs()
                    != currentTimeMs - offset * FIVE_MINUTE_MS) {
                return false;
            }
        }
        return true;
    }

    private long bandDuration(long fromMs, long toMsExclusive, boolean anchoredRange) {
        if (anchoredRange) {
            return ONE_DAY_MS;
        }
        long spanMs = Math.max(FIVE_MINUTE_MS, toMsExclusive - fromMs);
        long rawDurationMs = (spanMs + bandTargetCount - 1) / bandTargetCount;
        long bucketCount = Math.max(1L, (rawDurationMs + FIVE_MINUTE_MS - 1) / FIVE_MINUTE_MS);
        return bucketCount * FIVE_MINUTE_MS;
    }

    private GradeLevel grade(
            BigDecimal multiplier,
            BigDecimal p50,
            BigDecimal p80,
            BigDecimal p95) {
        if (multiplier.compareTo(p95) >= 0) {
            return GradeLevel.STRONG;
        }
        if (multiplier.compareTo(p80) >= 0) {
            return GradeLevel.MEDIUM;
        }
        if (multiplier.compareTo(p50) >= 0) {
            return GradeLevel.WEAK;
        }
        return GradeLevel.FLAT;
    }

    private String phase(BigDecimal futuresDelta, BigDecimal deltaOi) {
        boolean deltaPositive = futuresDelta.signum() > 0;
        boolean oiPositive = deltaOi.signum() > 0;
        if (deltaPositive && oiPositive) {
            return "NEW_LONG";
        }
        if (deltaPositive) {
            return "SHORT_COVERING";
        }
        if (oiPositive) {
            return "NEW_SHORT";
        }
        return "LONG_LIQUIDATION";
    }

    private boolean isRequested(long timeMs, long fromMs, long toMsExclusive) {
        return timeMs >= fromMs && timeMs < toMsExclusive;
    }

    private long legacyEndMs() {
        return Math.floorDiv(legacyCutoverMs, FIVE_MINUTE_MS) * FIVE_MINUTE_MS;
    }

    private enum GradeLevel {
        FLAT(0, "FLAT"),
        WEAK(1, "WEAK"),
        MEDIUM(2, "MEDIUM"),
        STRONG(3, "STRONG");

        private final int level;
        private final String code;

        GradeLevel(int level, String code) {
            this.level = level;
            this.code = code;
        }
    }

    private record SourceBar(long timeMs, BigDecimal futuresDelta) {
    }

    private record JoinedBar(SourceBar sourceBar, BigDecimal deltaOi) {
        private long timeMs() {
            return sourceBar.timeMs();
        }

        private BigDecimal futuresDelta() {
            return sourceBar.futuresDelta();
        }
    }

    private record Baselines(BigDecimal deltaOi, BigDecimal futuresDelta) {
    }

    private record GradedBar(
            JoinedBar joinedBar,
            GradeLevel grade,
            String phase,
            BigDecimal futuresDeltaMultiplier,
            BigDecimal deltaOiMultiplier) {
        private long timeMs() {
            return joinedBar.timeMs();
        }
    }

    private record OiPoint(long timeMs, BigDecimal openInterest) {
    }

    private record UnwindEpisode(OiPoint peak, long lastCandidateTimeMs) {
    }

    private record HistoryStatistics(
            int episodeCount,
            BigDecimal medianDrawdown3d,
            BigDecimal medianDrawdown7d,
            int over5pctWithin7d,
            Long sampleFromMs,
            Long sampleToMs) {
    }

    private record CachedUnwindHistory(long cacheDay, HistoryStatistics statistics) {
    }
}
