package com.chs.springboot.domain.binance.service;

import com.chs.springboot.domain.binance.model.AggTrade5m;
import com.chs.springboot.domain.binance.model.OpenInterest;
import com.chs.springboot.domain.binance.repository.AggTrade5mRepository;
import com.chs.springboot.domain.binance.repository.BinanceKline5mRepository;
import com.chs.springboot.domain.binance.repository.ForceOrderRepository;
import com.chs.springboot.domain.binance.repository.OpenInterestRepository;
import com.chs.springboot.domain.binance.repository.SignalParamsRepository;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Stream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class OpenInterestPhaseServiceTest {

    private static final String SYMBOL = "BTCUSDT";
    private static final long FIVE_MINUTE_MS = 300_000L;
    private static final long BASE_MS = 1_699_999_800_000L;
    private static final long LEGACY_CUTOVER_MS = 4_000_000_000_000L;

    @ParameterizedTest(name = "delta={0}, deltaOi={1} -> {2}")
    @MethodSource("quadrants")
    @DisplayName("futures delta와 delta OI의 부호 조합으로 네 국면을 만든다")
    void createsFourQuadrants(BigDecimal delta, BigDecimal deltaOi, String expectedPhase) {
        Fixture fixture = fixture(288, 1, BigDecimal.ONE, BigDecimal.ONE, delta, deltaOi);

        Map<String, Object> latest = latest(fixture.service().getPhases(
                SYMBOL, BASE_MS + 288 * FIVE_MINUTE_MS,
                BASE_MS + 289 * FIVE_MINUTE_MS, false));

        assertThat(latest)
                .containsEntry("phase", expectedPhase)
                .containsEntry("grade", "MEDIUM")
                .containsEntry("status", "CONFIRMED");
    }

    private static Stream<Arguments> quadrants() {
        return Stream.of(
                Arguments.of(value(2), value(2), "NEW_LONG"),
                Arguments.of(value(2), value(-2), "SHORT_COVERING"),
                Arguments.of(value(-2), value(2), "NEW_SHORT"),
                Arguments.of(value(-2), value(-2), "LONG_LIQUIDATION"));
    }

    @Test
    @DisplayName("한 축이 보합이면 결합 등급과 phase도 보합이 된다")
    void flatAxisMakesCombinedPhaseFlat() {
        Fixture fixture = fixture(288, 1, BigDecimal.ONE, BigDecimal.ONE, value("0.1"), value(2));

        Map<String, Object> latest = latest(fixture.service().getPhases(
                SYMBOL, BASE_MS + 288 * FIVE_MINUTE_MS,
                BASE_MS + 289 * FIVE_MINUTE_MS, false));

        assertThat(latest)
                .containsEntry("grade", "FLAT")
                .containsEntry("phase", null)
                .containsEntry("status", "CONFIRMED");
    }

    @Test
    @DisplayName("5분·30분 범위는 예외 없이 지원하지 않음 응답을 만든다")
    void rejectsShortRangeWithoutCallingPhaseService() {
        OpenInterestPhaseService phaseService = mock(OpenInterestPhaseService.class);
        SignalDataService signalDataService = new SignalDataService(
                mock(OpenInterestRepository.class),
                mock(ForceOrderRepository.class),
                mock(SignalCandleSource.class),
                mock(SignalParamsRepository.class),
                phaseService);

        Map<String, Object> result = signalDataService.getOiPhases(SYMBOL, "30m", null);

        assertThat(result)
                .containsEntry("supported", false)
                .containsEntry("code", "UNSUPPORTED_RANGE");
        verifyNoInteractions(phaseService);
    }

    @Test
    @DisplayName("직전 288봉이 없으면 등급 대상에서 제외한다")
    void excludesWarmupBars() {
        Fixture fixture = fixture(100, 1, BigDecimal.ONE, BigDecimal.ONE, value(2), value(2));

        Map<String, Object> result = fixture.service().getPhases(
                SYMBOL, BASE_MS + 100 * FIVE_MINUTE_MS,
                BASE_MS + 101 * FIVE_MINUTE_MS, false);
        Map<String, Object> latest = latest(result);
        Map<String, Object> quality = quality(result);
        List<Map<String, Object>> bands = bands(result);

        assertThat(latest).containsEntry("status", "FLAT_UNCONFIRMED");
        assertThat(result).containsEntry("latestConfirmedCandleTimeMs", BASE_MS + 100 * FIVE_MINUTE_MS);
        assertThat(quality).containsEntry("warmupExcludedBars", 1);
        assertThat(bands.get(0)).containsEntry("barCount", 0);
    }

    @Test
    @DisplayName("5분 격자가 아닌 OI 행은 버리고 quality에 센다")
    void dropsOffGridOiRows() {
        Fixture fixture = fixture(288, 1, BigDecimal.ONE, BigDecimal.ONE, value(2), value(2));
        fixture.oiRows().add(oi(BASE_MS + 1234, value(100)));

        Map<String, Object> quality = quality(fixture.service().getPhases(
                SYMBOL, BASE_MS + 288 * FIVE_MINUTE_MS,
                BASE_MS + 289 * FIVE_MINUTE_MS, false));

        assertThat(quality).containsEntry("droppedOffGridOiRows", 1);
    }

    @Test
    @DisplayName("OI 간격이 5분이 아니면 delta OI를 만들지 않는다")
    void skipsNonFiveMinuteOiPair() {
        OpenInterestRepository oiRepository = mock(OpenInterestRepository.class);
        AggTrade5mRepository aggRepository = mock(AggTrade5mRepository.class);
        BinanceKline5mRepository klineRepository = mock(BinanceKline5mRepository.class);
        when(oiRepository.findBySymbolAndCollectedAtMsBetweenOrderByCollectedAtMsAsc(
                anyString(), anyLong(), anyLong())).thenReturn(List.of(
                oi(BASE_MS, value(100)), oi(BASE_MS + 600_000L, value(102))));
        when(aggRepository.findCandlesBySymbolAndMarketTypeAndTimeRange(
                anyString(), anyString(), anyLong(), anyLong())).thenReturn(List.of(candle(BASE_MS, value(2))));
        when(klineRepository.findBySymbolAndMarketTypeAndCandleTimeMsGreaterThanEqualAndCandleTimeMsLessThanOrderByCandleTimeMsAsc(
                anyString(), anyString(), anyLong(), anyLong())).thenReturn(List.of());

        Map<String, Object> result = service(oiRepository, aggRepository, klineRepository).getPhases(
                SYMBOL, BASE_MS, BASE_MS + FIVE_MINUTE_MS, false);

        assertThat(result).containsEntry("latestConfirmedCandleTimeMs", null);
        assertThat(quality(result)).containsEntry("skippedMissingPairs", 1);
        assertThat(latest(result)).containsEntry("deltaOi", null);
    }

    @Test
    @DisplayName("다음 OI가 없는 마지막 봉은 제외한다")
    void skipsLastBarWithoutNextOi() {
        OpenInterestRepository oiRepository = mock(OpenInterestRepository.class);
        AggTrade5mRepository aggRepository = mock(AggTrade5mRepository.class);
        BinanceKline5mRepository klineRepository = mock(BinanceKline5mRepository.class);
        when(oiRepository.findBySymbolAndCollectedAtMsBetweenOrderByCollectedAtMsAsc(
                anyString(), anyLong(), anyLong())).thenReturn(List.of(oi(BASE_MS, value(100))));
        when(aggRepository.findCandlesBySymbolAndMarketTypeAndTimeRange(
                anyString(), anyString(), anyLong(), anyLong())).thenReturn(List.of(candle(BASE_MS, value(2))));
        when(klineRepository.findBySymbolAndMarketTypeAndCandleTimeMsGreaterThanEqualAndCandleTimeMsLessThanOrderByCandleTimeMsAsc(
                anyString(), anyString(), anyLong(), anyLong())).thenReturn(List.of());

        Map<String, Object> result = service(oiRepository, aggRepository, klineRepository).getPhases(
                SYMBOL, BASE_MS, BASE_MS + FIVE_MINUTE_MS, false);

        assertThat(result).containsEntry("latestConfirmedCandleTimeMs", null);
        assertThat(quality(result)).containsEntry("skippedMissingPairs", 1);
    }

    @Test
    @DisplayName("기준값이 0인 창은 무한 배수 없이 별도 제외한다")
    void skipsZeroBaselineWindow() {
        Fixture fixture = fixture(288, 1, BigDecimal.ZERO, BigDecimal.ZERO, value(2), value(2));

        Map<String, Object> result = fixture.service().getPhases(
                SYMBOL, BASE_MS + 288 * FIVE_MINUTE_MS,
                BASE_MS + 289 * FIVE_MINUTE_MS, false);
        Map<String, Object> latest = latest(result);

        assertThat(quality(result)).containsEntry("skippedZeroBaselineWindows", 1);
        assertThat(latest)
                .containsEntry("status", "FLAT_UNCONFIRMED")
                .containsEntry("deltaMultiplier", null)
                .containsEntry("deltaOiMultiplier", null);
    }

    @Test
    @DisplayName("칸당 봉 수가 12 이하이면 최대 등급, 초과하면 우세 국면과 비율을 쓴다")
    void switchesBandRepresentativeRuleAtTwelveBars() {
        Fixture shortFixture = fixture(288, 12, BigDecimal.ONE, BigDecimal.ONE, value(2), value(2));
        Map<String, Object> shortBand = bands(shortFixture.service().getPhases(
                SYMBOL, BASE_MS + 288 * FIVE_MINUTE_MS,
                BASE_MS + 300 * FIVE_MINUTE_MS, true)).get(0);

        Fixture longFixture = fixture(288, 13, BigDecimal.ONE, BigDecimal.ONE, value(2), value(2));
        Map<String, Object> longBand = bands(longFixture.service().getPhases(
                SYMBOL, BASE_MS + 288 * FIVE_MINUTE_MS,
                BASE_MS + 301 * FIVE_MINUTE_MS, true)).get(0);

        assertThat(shortBand)
                .containsEntry("barCount", 12)
                .containsEntry("representativeGrade", "MEDIUM")
                .containsEntry("dominanceRatio", null);
        assertThat(longBand)
                .containsEntry("barCount", 13)
                .containsEntry("representativeGrade", null)
                .containsEntry("representativePhase", "NEW_LONG")
                .containsEntry("dominanceRatio", 1.0);
    }

    @Test
    @DisplayName("정확히 하루 범위면 판정 봉이 288개보다 적어도 쏠림을 만든다")
    void showsTiltAtMinimumRangeWithFewerThanWindowBars() {
        Fixture fixture = fixture(288, 286, BigDecimal.ONE, BigDecimal.ONE, value(2), value(2));

        Map<String, Object> result = fixture.service().getPhases(
                SYMBOL,
                BASE_MS + 288 * FIVE_MINUTE_MS,
                BASE_MS + 576 * FIVE_MINUTE_MS,
                false);

        assertThat(tilt(result))
                .isNotNull()
                .containsEntry("windowBars", 288L)
                .containsEntry("gradedBarCount", 286)
                .containsEntry("quadrantBarCount", 286);
    }

    @Test
    @DisplayName("하루보다 짧은 범위는 쏠림을 만들지 않는다")
    void hidesTiltBelowMinimumRange() {
        Fixture fixture = fixture(288, 48, BigDecimal.ONE, BigDecimal.ONE, value(2), value(2));

        Map<String, Object> result = fixture.service().getPhases(
                SYMBOL,
                BASE_MS + 288 * FIVE_MINUTE_MS,
                BASE_MS + 336 * FIVE_MINUTE_MS,
                false);

        assertThat(result).containsEntry("tilt", null);
    }

    @Test
    @DisplayName("쏠림 창 봉 수는 고정값이 아니라 요청 범위에서 계산한다")
    void reportsRequestedWindowBarCount() {
        Fixture fixture = fixture(288, 286, BigDecimal.ONE, BigDecimal.ONE, value(2), value(2));

        Map<String, Object> result = fixture.service().getPhases(
                SYMBOL,
                BASE_MS + 288 * FIVE_MINUTE_MS,
                BASE_MS + 864 * FIVE_MINUTE_MS,
                false);

        assertThat(tilt(result))
                .containsEntry("windowBars", 576L)
                .containsEntry("gradedBarCount", 286);
    }

    @Test
    @DisplayName("4분면 봉 수 보고값은 4분면별 개수 합과 일치한다")
    void reportsQuadrantBarCountConsistentWithCounts() {
        Fixture fixture = fixture(288, 286, BigDecimal.ONE, BigDecimal.ONE, value(2), value(2));

        Map<String, Object> result = fixture.service().getPhases(
                SYMBOL,
                BASE_MS + 288 * FIVE_MINUTE_MS,
                BASE_MS + 576 * FIVE_MINUTE_MS,
                false);
        Map<String, Object> tilt = tilt(result);
        Map<String, Integer> quadrantCounts = quadrantCounts(tilt);

        assertThat(quadrantCounts.values().stream().mapToInt(Integer::intValue).sum())
                .isEqualTo(tilt.get("quadrantBarCount"));
    }

    @Test
    @DisplayName("12시간 이내 OI 갱신은 하나의 에피소드로 묶고 가장 높은 봉을 고점으로 쓴다")
    void groupsPeaksWithinTwelveHoursAndUsesHighestPeak() {
        List<OpenInterest> oiRows = new ArrayList<>();
        BigDecimal oiValue = value(100);
        for (int index = 0; index <= 2161; index++) {
            long timeMs = BASE_MS + index * FIVE_MINUTE_MS;
            if (index == 2016) {
                oiValue = value(101);
            } else if (index == 2160) {
                oiValue = value(102);
            } else if (index == 2161) {
                oiValue = value(101);
            }
            oiRows.add(oi(timeMs, oiValue));
        }

        Map<String, Object> unwind = unwindService(oiRows).getPhases(
                SYMBOL, BASE_MS, BASE_MS + 2162 * FIVE_MINUTE_MS, false);
        Map<String, Object> current = currentUnwind(unwind);

        assertThat(current)
                .containsEntry("peakTimeMs", BASE_MS + 2160 * FIVE_MINUTE_MS)
                .containsEntry("peakOi", 102.0)
                .containsEntry("observationCompleted", false);
        assertThat(history(unwind)).containsEntry("episodeCount", 0);
    }

    @Test
    @DisplayName("7일 관찰이 끝나지 않은 에피소드는 과거 통계에서 제외한다")
    void excludesEpisodeBeforeSevenDayObservationCompletes() {
        List<OpenInterest> oiRows = new ArrayList<>();
        for (int index = 0; index <= 2016 + 2015; index++) {
            BigDecimal oiValue = index < 2016 ? value(100) : value(101);
            oiRows.add(oi(BASE_MS + index * FIVE_MINUTE_MS, oiValue));
        }

        Map<String, Object> unwind = unwindService(oiRows).getPhases(
                SYMBOL, BASE_MS, BASE_MS + (2016 + 2015) * FIVE_MINUTE_MS, false);

        assertThat(currentUnwind(unwind)).isNotNull();
        assertThat(history(unwind))
                .containsEntry("episodeCount", 0)
                .containsEntry("medianDrawdown7d", null);
    }

    @Test
    @DisplayName("해소 낙폭은 첫 임계 통과가 아니라 7일 관찰 구간의 최저 OI로 계산한다")
    void usesMinimumOiWithinObservationWindow() {
        List<OpenInterest> oiRows = new ArrayList<>();
        for (int index = 0; index <= 2016 + 2016; index++) {
            BigDecimal oiValue;
            if (index < 2016) {
                oiValue = value(100);
            } else if (index == 2016) {
                oiValue = value(110);
            } else if (index == 2017) {
                oiValue = value("106.7");
            } else {
                oiValue = value(99);
            }
            oiRows.add(oi(BASE_MS + index * FIVE_MINUTE_MS, oiValue));
        }

        Map<String, Object> history = history(unwindService(oiRows).getPhases(
                SYMBOL, BASE_MS, BASE_MS + (2016 + 2017) * FIVE_MINUTE_MS, false));

        assertThat(history)
                .containsEntry("episodeCount", 1)
                .containsEntry("medianDrawdown7d", -10.0)
                .containsEntry("over5pctWithin7d", 1);
    }

    private Fixture fixture(
            int warmupBars,
            int selectedBars,
            BigDecimal warmupDelta,
            BigDecimal warmupDeltaOi,
            BigDecimal selectedDelta,
            BigDecimal selectedDeltaOi) {
        OpenInterestRepository oiRepository = mock(OpenInterestRepository.class);
        AggTrade5mRepository aggRepository = mock(AggTrade5mRepository.class);
        BinanceKline5mRepository klineRepository = mock(BinanceKline5mRepository.class);
        List<AggTrade5m> candles = new ArrayList<>();
        List<OpenInterest> oiRows = new ArrayList<>();
        BigDecimal oiValue = value(100);
        int totalBars = warmupBars + selectedBars;
        for (int index = 0; index < totalBars; index++) {
            long timeMs = BASE_MS + index * FIVE_MINUTE_MS;
            boolean selected = index >= warmupBars;
            BigDecimal delta = selected ? selectedDelta : warmupDelta;
            BigDecimal deltaOi = selected ? selectedDeltaOi : warmupDeltaOi;
            candles.add(candle(timeMs, delta));
            oiRows.add(oi(timeMs, oiValue));
            oiValue = oiValue.add(deltaOi);
        }
        oiRows.add(oi(BASE_MS + totalBars * FIVE_MINUTE_MS, oiValue));

        when(oiRepository.findBySymbolAndCollectedAtMsBetweenOrderByCollectedAtMsAsc(
                anyString(), anyLong(), anyLong())).thenReturn(oiRows);
        when(aggRepository.findCandlesBySymbolAndMarketTypeAndTimeRange(
                anyString(), anyString(), anyLong(), anyLong())).thenReturn(candles);
        when(klineRepository.findBySymbolAndMarketTypeAndCandleTimeMsGreaterThanEqualAndCandleTimeMsLessThanOrderByCandleTimeMsAsc(
                anyString(), anyString(), anyLong(), anyLong())).thenReturn(List.of());
        return new Fixture(service(oiRepository, aggRepository, klineRepository), oiRows);
    }

    private OpenInterestPhaseService service(
            OpenInterestRepository oiRepository,
            AggTrade5mRepository aggRepository,
            BinanceKline5mRepository klineRepository) {
        return new OpenInterestPhaseService(
                oiRepository,
                aggRepository,
                klineRepository,
                LEGACY_CUTOVER_MS,
                288,
                86_400_000L,
                48,
                value("0.472369"),
                value("1.345266"),
                value("3.794053"),
                value("0.502062"),
                value("1.379493"),
                value("3.673613"),
                2016,
                43_200_000L,
                2016);
    }

    private OpenInterestPhaseService unwindService(List<OpenInterest> oiRows) {
        OpenInterestRepository oiRepository = mock(OpenInterestRepository.class);
        AggTrade5mRepository aggRepository = mock(AggTrade5mRepository.class);
        BinanceKline5mRepository klineRepository = mock(BinanceKline5mRepository.class);
        when(oiRepository.findBySymbolAndCollectedAtMsBetweenOrderByCollectedAtMsAsc(
                anyString(), anyLong(), anyLong())).thenReturn(oiRows);
        when(oiRepository.findMinCollectedAtMsBySymbol(anyString()))
                .thenReturn(Optional.of(oiRows.get(0).getCollectedAtMs()));
        when(oiRepository.findMaxCollectedAtMsBySymbol(anyString()))
                .thenReturn(Optional.of(oiRows.get(oiRows.size() - 1).getCollectedAtMs()));
        return service(oiRepository, aggRepository, klineRepository);
    }

    private static AggTrade5m candle(long timeMs, BigDecimal delta) {
        AggTrade5m candle = new AggTrade5m();
        candle.setSymbol(SYMBOL);
        candle.setMarketType("FUTURES");
        candle.setCandleTimeMs(timeMs);
        candle.setDelta(delta);
        return candle;
    }

    private static OpenInterest oi(long timeMs, BigDecimal openInterest) {
        OpenInterest oi = new OpenInterest();
        oi.setSymbol(SYMBOL);
        oi.setCollectedAtMs(timeMs);
        oi.setOpenInterest(openInterest);
        return oi;
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> latest(Map<String, Object> result) {
        return (Map<String, Object>) result.get("latest");
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> currentUnwind(Map<String, Object> result) {
        Map<String, Object> oiUnwind = (Map<String, Object>) result.get("oiUnwind");
        return (Map<String, Object>) oiUnwind.get("current");
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> history(Map<String, Object> result) {
        Map<String, Object> oiUnwind = (Map<String, Object>) result.get("oiUnwind");
        return (Map<String, Object>) oiUnwind.get("history");
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> quality(Map<String, Object> result) {
        return (Map<String, Object>) result.get("quality");
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> tilt(Map<String, Object> result) {
        return (Map<String, Object>) result.get("tilt");
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Integer> quadrantCounts(Map<String, Object> tilt) {
        return (Map<String, Integer>) tilt.get("quadrantCounts");
    }

    @SuppressWarnings("unchecked")
    private static List<Map<String, Object>> bands(Map<String, Object> result) {
        return (List<Map<String, Object>>) result.get("bands");
    }

    private static BigDecimal value(int value) {
        return BigDecimal.valueOf(value);
    }

    private static BigDecimal value(String value) {
        return new BigDecimal(value);
    }

    private record Fixture(OpenInterestPhaseService service, List<OpenInterest> oiRows) {
    }
}
