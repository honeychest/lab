package com.chs.springboot.domain.binance.autotrade.service;

import com.chs.springboot.domain.binance.analysis.MarketSnapshotCalculator;
import com.chs.springboot.domain.binance.model.BinanceKline;
import com.chs.springboot.domain.binance.model.BinanceKlineInterval;
import com.chs.springboot.domain.binance.model.IntervalMarketSnapshot;
import com.chs.springboot.domain.binance.model.MarketDataStatus;
import com.chs.springboot.domain.binance.model.MultiTimeframeMarketSnapshot;
import com.chs.springboot.domain.binance.service.BinanceKlineRestClient;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
@RequiredArgsConstructor
public class AutoTradeMarketSnapshotService {

    private static final int CANDLE_COUNT = 200;
    private static final List<BinanceKlineInterval> DECISION_INTERVALS = List.of(
            BinanceKlineInterval.FIVE_MINUTES,
            BinanceKlineInterval.FIFTEEN_MINUTES,
            BinanceKlineInterval.FOUR_HOURS,
            BinanceKlineInterval.ONE_DAY
    );

    private final BinanceKlineRestClient restClient;

    public MultiTimeframeMarketSnapshot capture(String symbol) {
        long asOfMs = System.currentTimeMillis();
        List<IntervalMarketSnapshot> intervals = DECISION_INTERVALS.stream()
                .map(interval -> captureInterval(symbol, interval, asOfMs))
                .toList();
        boolean analysisAvailable = intervals.stream().allMatch(IntervalMarketSnapshot::analyzable);
        return new MultiTimeframeMarketSnapshot(symbol, "FUTURES", asOfMs, true, 0L,
                intervals, analysisAvailable);
    }

    private IntervalMarketSnapshot captureInterval(String symbol,
                                                    BinanceKlineInterval interval,
                                                    long asOfMs) {
        List<BinanceKline> candles = restClient.fetchLatestClosedFutures(symbol, interval, CANDLE_COUNT);
        return MarketSnapshotCalculator.calculate(interval, candles, null, asOfMs,
                MarketDataStatus.READY, "");
    }
}
