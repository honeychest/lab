import BinanceTicker from '../../../domain/binance/ui/ticker/BinanceTicker.tsx';
import BinanceTickerMobile from '../../../domain/binance/ui/ticker/BinanceTickerMobile.tsx';
import { BINANCE_MARKETS } from '../../../domain/binance/model/market/binanceMarketSelection.js';
import { formatUsdtRateLabel } from '../model/binanceTickerCardView.js';
import { getCoinTabTone } from '../model/binanceTickerCardStyles.js';
import styles from './BinanceTickerCard.module.css';

function BinanceTickerCard({
    ticker,
    selectedSymbol,
    onSelectSymbol,
    selectedCoin,
    upbitTicker,
    usdtTicker,
    liveStatus,
    tickerWrapperRef,
    minimumSizeStyle,
}) {
    return (
        <div className={styles.card}>
            <div className={styles.headerRow}>
                <div className={styles.coinTabsScroll}>
                    {BINANCE_MARKETS.map((coin) => {
                        const isActive = coin.symbol === selectedSymbol;
                        const tone = getCoinTabTone(isActive);
                        return (
                            <button
                                key={coin.symbol}
                                type="button"
                                className={styles.coinTab}
                                onClick={() => onSelectSymbol(coin.symbol)}
                                style={{
                                    border: tone.border,
                                    background: tone.background,
                                    color: tone.color,
                                    outline: tone.outline,
                                }}
                            >
                                {coin.code}
                            </button>
                        );
                    })}
                </div>

                <div className={styles.statusBlock}>
                    <div className={styles.statusRow}>
                        <span
                            key={ticker ? String(ticker.E) : 'no-ticker'}
                            className={`${styles.liveDot} ${liveStatus.blink ? styles.liveDotBlink : ''}`}
                            style={{
                                border: `2px solid ${liveStatus.color}`,
                                backgroundColor: liveStatus.fill,
                                transition: liveStatus.transition,
                            }}
                        />
                        <span className={styles.statusText} style={{ color: liveStatus.color }}>
                            {liveStatus.text}
                        </span>
                    </div>

                    <span className={styles.rateText}>
                        {formatUsdtRateLabel(usdtTicker)}
                    </span>
                </div>
            </div>

            <div ref={tickerWrapperRef} style={minimumSizeStyle}>
                <div className={styles.pcOnly}>
                    <BinanceTicker
                        ticker={ticker}
                        upbitTicker={selectedCoin.upbitCode ? upbitTicker : undefined}
                        usdtKrwTicker={usdtTicker}
                        pairLabel={selectedCoin.label}
                    />
                </div>

                <div className={styles.mobileOnly}>
                    <BinanceTickerMobile
                        ticker={ticker}
                        upbitTicker={selectedCoin.upbitCode ? upbitTicker : undefined}
                        usdtKrwTicker={usdtTicker}
                        pairLabel={selectedCoin.label}
                    />
                </div>
            </div>
        </div>
    );
}

export default BinanceTickerCard;
