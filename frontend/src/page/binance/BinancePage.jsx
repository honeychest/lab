import { useState, useMemo, useEffect } from 'react';
import Layout from '../../shared/ui/layout/Layout.jsx';
import ErrorPage from '../error/ErrorPage.tsx';
import '../../styles/themes/theme-dark.css';
import { usePageTheme } from '@/app/context/useTheme.js';
import { useBinanceWebSocket } from '../../domain/binance/model/hook/useBinanceWebSocket.ts';
import { useUpbitWebSocket } from '../../domain/binance/model/hook/useUpbitWebSocket.ts';
import { useBinanceWallet } from '../../domain/binance/model/hook/useBinanceWallet.js';
import { useTickerPanelStability } from '../../domain/binance/model/hook/useTickerPanelStability.js';
import BinanceTickerCard from './ui/BinanceTickerCard.jsx';
import BinancePageHeader from './ui/BinancePageHeader.jsx';
import BinanceWalletCard from './ui/BinanceWalletCard.jsx';
import {
    BINANCE_MARKETS,
    getSelectedBinanceMarket,
    getUpbitSubscriptionCodes,
} from '../../domain/binance/model/market/binanceMarketSelection.js';
import { buildBinanceLiveStatus } from '../../domain/binance/model/status/binanceLiveStatus.js';

const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function BinancePage() {
    const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);
    const [selectedSymbol, setSelectedSymbol] = useState(BINANCE_MARKETS[0].symbol);
    const { ticker, status } = useBinanceWebSocket(selectedSymbol);
    const {
        accountInfo,
        walletLoading,
        walletError,
        serverError,
    } = useBinanceWallet();

    const liveStatus = buildBinanceLiveStatus({
        status,
        ticker,
        prefersReducedMotion,
    });

    const [theme] = usePageTheme('binance');
    const themeClass = theme !== 'dark' ? `theme-${theme}` : '';
    const selectedCoin = getSelectedBinanceMarket(selectedSymbol);
    const upbitCodes = useMemo(
        () => getUpbitSubscriptionCodes(selectedCoin),
        [selectedCoin],
    );
    const { tickers: upbitTickers } = useUpbitWebSocket(upbitCodes);
    const upbitTicker = selectedCoin.upbitCode
        ? upbitTickers[selectedCoin.upbitCode] ?? null
        : undefined;
    const usdtTicker = upbitTickers['KRW-USDT'] ?? null;

    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth < 768);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    const {
        wrapperRef: tickerWrapperRef,
        minimumSizeStyle,
    } = useTickerPanelStability(ticker);

    if (serverError) return <ErrorPage code={serverError} />;

    if (walletLoading) return null;

    return (
        <Layout footerCenter={['TypeScript', 'WebSocket', 'Binance API', 'Axios']}>
            <div className={themeClass || undefined} style={{
                minHeight: '100%',
                background: 'var(--dark-bg)',
                padding: isMobile ? '16px' : '32px',
                boxSizing: 'border-box',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
            }}>
                <div style={{ maxWidth: isMobile ? '100%' : '1120px', margin: '0 auto' }}>
                    <BinancePageHeader />

                    <BinanceTickerCard
                        ticker={ticker}
                        selectedSymbol={selectedSymbol}
                        onSelectSymbol={setSelectedSymbol}
                        selectedCoin={selectedCoin}
                        upbitTicker={upbitTicker}
                        usdtTicker={usdtTicker}
                        liveStatus={liveStatus}
                        tickerWrapperRef={tickerWrapperRef}
                        minimumSizeStyle={minimumSizeStyle}
                    />

                    <BinanceWalletCard
                        accountInfo={accountInfo}
                        walletLoading={walletLoading}
                        walletError={walletError}
                    />
                </div>
            </div>
        </Layout>
    );
}

export default BinancePage;
