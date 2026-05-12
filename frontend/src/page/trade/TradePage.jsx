// [AGENT] BTC 대형 체결 실시간 페이지 — SSE 목록 + 스캔 슬롯 + 조회 사이드 패널 + 모바일 무한스크롤
// 연관: useBinanceTradeSse.ts, TradePanel.tsx, BinanceTradeController.java
// 주요기능: 스캔슬롯 애니메이션, 200건 캡(데스크탑), 무한스크롤(모바일), Sheet 사이드 패널
import { useEffect, useState } from 'react';
import Layout from '../../shared/ui/layout/Layout.jsx';
import { useBinanceTradeSse } from '../../domain/binance/model/hook/useBinanceTradeSse.ts';
import { useRawTickSse } from '../../domain/binance/model/hook/useRawTickSse.ts';
import TradePanel from './TradePanel.tsx';
import TickTable from './TickTable.jsx';
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
} from '@/shared/ui/shadcn/sheet.js';
import styles from './TradePage.module.css';
import '@/styles/themes/theme-dark.css';
import { usePageTheme } from '@/app/context/useTheme.js';
import {
    formatTickQtyTotal,
} from './model/tradeDisplayModel.js';
import { useNewTradeHighlight } from './model/hook/useNewTradeHighlight.js';
import { useTickTotals } from './model/hook/useTickTotals.js';
import { useTradeThreshold } from './model/hook/useTradeThreshold.js';
import { useTradeMobileLoadMore } from './model/hook/useTradeMobileLoadMore.js';
import { getScanSlotView, getTradeSymbol } from './model/tradePageViewModel.js';
import TradeScanSlot from './TradeScanSlot.jsx';
import TradePageHeader from './TradePageHeader.jsx';
import TradeDesktopTradesTable from './TradeDesktopTradesTable.jsx';
import TradeMobileList from './TradeMobileList.jsx';

// ── 컴포넌트 ──────────────────────────────────────────────────
function TradePage() {
    const [theme] = usePageTheme('trade');
    const themeClass = theme !== 'dark' ? `theme-${theme}` : '';
    const { trades, scanState, initError, loadMore } = useBinanceTradeSse();
    const { ticks, isConnecting: isTickConnecting } = useRawTickSse();

    // 1분마다 경과시간 재계산 (서버 호출 없이 로컬 setInterval)
    const [, setTick] = useState(0);
    useEffect(() => {
        const id = setInterval(() => setTick(t => t + 1), 60_000);
        return () => clearInterval(id);
    }, []);

    const { threshold, setThreshold, canEdit: canEditThreshold } = useTradeThreshold();

    // 조회 사이드 패널 오픈 상태
    const [isPanelOpen, setIsPanelOpen] = useState(false);

    // 모바일 감지 (마운트 시 1회)
    const isMobile = typeof window !== 'undefined' && window.innerWidth <= 768;

    const {
        loadMoreRef,
        isLoadingMore,
        loadMoreError,
        handleLoadMore,
    } = useTradeMobileLoadMore({ trades, loadMore, isMobile });

    const tickTotals = useTickTotals(ticks, isTickConnecting);

    const newTradeIds = useNewTradeHighlight(trades[0]?.id);

    // ── 스캔 슬롯 ───────────────────────────────────────────
    const scanSlotView = getScanSlotView(scanState);
    const symbol = getTradeSymbol(trades);

    return (
        <Layout footerCenter={['SSE', 'TypeScript', 'Binance API', 'shadcn/ui', 'Tailwind CSS']}>
            <div className={`min-h-full md:h-full md:overflow-hidden bg-[var(--dark-bg)] p-4 md:p-8 box-border ${themeClass}`}>
                <div className="max-w-6xl mx-auto md:flex md:flex-col md:gap-2 md:h-full md:overflow-hidden">

                    {/* ── 페이지 헤더 (전체 너비) ───────────────────── */}
                    <TradePageHeader symbol={symbol} onOpenPanel={() => setIsPanelOpen(true)} />

                    {/* ── 초기 로드 실패 ───────────────────────────── */}
                    {initError && (
                        <div className="bg-[var(--dark-card-bg)] border border-red-500/30 rounded-xl p-6 text-center text-[var(--dark-text-neutral)] text-sm">
                            체결 내역을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.
                        </div>
                    )}

                    {/* ── 데스크탑: 2열 (큰거래 | 틱) ─────────────────── */}
                    {!initError && (
                        <div className="hidden md:flex md:flex-1 md:min-h-0 md:gap-2">
                            {/* 좌: 큰거래 테이블 (스캔 슬롯 + 테이블, 스크롤바는 부모로 클리핑) */}
                            <div className="flex-1 min-h-0 flex flex-col bg-[var(--dark-card-bg)] border border-[var(--dark-border)] rounded-2xl overflow-hidden">
                                {/* 스캔 슬롯 */}
                                <TradeScanSlot scanSlotView={scanSlotView} threshold={threshold} />

                                {/* 테이블 스크롤 영역 (스크롤바는 아래 overflow-hidden이 잘라냄) */}
                                <div className="flex-1 min-h-0 overflow-hidden">
                                    <div className={styles.scrollbarClipWide}>
                                        <TradeDesktopTradesTable
                                            trades={trades}
                                            newTradeIds={newTradeIds}
                                            initError={initError}
                                            styles={styles}
                                        />
                                    </div>
                                </div>
                            </div>
                            {/* 우: 틱 테이블 (스크롤바 클리핑) */}
                            <div className="w-3/18 min-h-0 flex flex-col flex-shrink-0 border border-[var(--dark-border)] rounded-2xl overflow-hidden bg-[var(--dark-card-bg)]">
                                <div className="h-10 flex-shrink-0 border-b border-[var(--dark-border)] bg-[var(--dark-bg)] px-3 flex items-center justify-between">
                                <div className="grid grid-cols-2 gap-x-4 text-right leading-tight flex-grow-1">
                                    <span className="text-xs text-[var(--dark-text-neutral)] font-mono text-center">매수 BTC</span>
                                    <span className="text-xs text-[var(--dark-text-neutral)] font-mono text-center">매도 BTC</span>
                                    <span className="text-xs font-mono text-green-400 text-center">
                                        {formatTickQtyTotal(tickTotals.buy)}
                                    </span>
                                    <span className="text-xs font-mono text-red-400 text-center">
                                        {formatTickQtyTotal(tickTotals.sell)}
                                    </span>
                                </div>
                                </div>
                                <div className="flex-1 min-h-0 overflow-hidden">
                                    <div className={styles.scrollbarClip}>
                                        <TickTable ticks={ticks} isConnecting={isTickConnecting} />
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ── 모바일 카드 목록 (md 미만) ───────────────── */}
                    {!initError && (
                        <div className="md:hidden flex flex-col gap-2">
                            {/* 모바일 스캔 슬롯 */}
                            <TradeScanSlot scanSlotView={scanSlotView} threshold={threshold} variant="mobile" />

                            <TradeMobileList
                                trades={trades}
                                newTradeIds={newTradeIds}
                                isLoadingMore={isLoadingMore}
                                loadMoreError={loadMoreError}
                                onRetryLoadMore={handleLoadMore}
                                loadMoreRef={loadMoreRef}
                                styles={styles}
                            />
                        </div>
                    )}
                </div>
            </div>

            {/* ── 조회 사이드 패널 (Sheet, 제어 방식) ─────────── */}
            <Sheet open={isPanelOpen} onOpenChange={setIsPanelOpen}>
                <SheetContent
                    side="right"
                    aria-describedby={undefined}
                    className="md:w-80 md:sm:w-96 p-0 border-[var(--dark-border)] bg-[var(--dark-card-bg)] md:max-w-96 w-full"
                    showCloseButton={true}
                >
                    <SheetHeader className="px-4 py-3 border-b border-[var(--dark-border)] flex flex-row items-center justify-between">
                        <SheetTitle className="text-[var(--dark-text-primary)] text-sm">체결 조회</SheetTitle>
                    </SheetHeader>
                    <div className="flex-1 overflow-hidden h-[calc(100%-56px)]">
                        <TradePanel threshold={threshold} canEditThreshold={canEditThreshold} onThresholdChange={setThreshold} onClose={() => setIsPanelOpen(false)} />
                    </div>
                </SheetContent>
            </Sheet>
        </Layout>
    );
}

export default TradePage;
