// [AGENT] BTC 대형 체결 실시간 페이지 — SSE 목록 + 스캔 슬롯 + 조회 사이드 패널 + 모바일 무한스크롤
// 연관: useBinanceTradeSse.ts, TradePanel.tsx, BinanceTradeController.java
// 주요기능: 스캔슬롯 애니메이션, 200건 캡(데스크탑), 무한스크롤(모바일), Sheet 사이드 패널
import { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import Layout from '../../shared/ui/layout/Layout.jsx';
import { useBinanceTradeSse } from '../../domain/binance/model/hook/useBinanceTradeSse.ts';
import { useRawTickSse } from '../../domain/binance/model/hook/useRawTickSse.ts';
import TradePanel from './TradePanel.tsx';
import TickTable from './TickTable.jsx';
import { Badge } from '@/shared/ui/shadcn/badge.js';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/shared/ui/shadcn/input-otp.js';
import { Skeleton } from '@/shared/ui/shadcn/skeleton.js';
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
    SheetTrigger,
} from '@/shared/ui/shadcn/sheet.js';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/shared/ui/shadcn/table.js';
import styles from './TradePage.module.css';
import { formatWithComma } from '@/shared/lib/utils.js';

// ── 포맷 유틸 ──────────────────────────────────────────────────
const formatThreshold = (v) => {
    if (v == null) return '...';
    const n = Number(v);
    const futures = formatWithComma(n);
    const spot = formatWithComma(Math.round(n / 2));
    return `${futures} / ${spot} USD`;
};
const formatTime = (tradedAt) =>
    new Date(tradedAt).toLocaleTimeString('ko-KR', {
        timeZone: 'Asia/Seoul',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
    });

const formatPrice = (v) =>
    parseFloat(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const formatQty = (v) => parseFloat(v).toFixed(4);

const formatValue = (v) => {
    const n = parseFloat(v);
    if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
    return `$${(n / 1_000).toFixed(0)}K`;
};

const getElapsed = (tradedAt) => {
    const diffMin = Math.floor((Date.now() - tradedAt) / 60_000);
    if (diffMin < 1) return '방금';
    if (diffMin < 60) return `${diffMin}분 전`;
    const diffHour = Math.floor(diffMin / 60);
    if (diffHour < 24) return `${diffHour}시간 전`;
    return `${Math.floor(diffHour / 24)}일 전`;
};

const USD_KRW_RATE = 1450;
const formatKrw = (usdValue) => {
    const krw = Math.round(parseFloat(usdValue) * USD_KRW_RATE);
    return `${formatWithComma(krw)}원`;
};

const formatTickQtyTotal = (v) => v.toFixed(4);

// ── 컴포넌트 ──────────────────────────────────────────────────
function TradePage() {
    const { trades, scanState, initError, loadMore } = useBinanceTradeSse();
    const { ticks, isConnecting: isTickConnecting } = useRawTickSse();

    // 1분마다 경과시간 재계산 (서버 호출 없이 로컬 setInterval)
    const [, setTick] = useState(0);
    useEffect(() => {
        const id = setInterval(() => setTick(t => t + 1), 60_000);
        return () => clearInterval(id);
    }, []);

    // threshold (canEdit: 허용 IP에서만 true)
    const [threshold, setThreshold] = useState(null);
    const [canEditThreshold, setCanEditThreshold] = useState(false);
    useEffect(() => {
        axios.get('/api/binance/trades/threshold').then(r => {
            setThreshold(r.data.value);
            setCanEditThreshold(!!r.data.canEdit);
        });
    }, []);

    // 조회 사이드 패널 오픈 상태
    const [isPanelOpen, setIsPanelOpen] = useState(false);

    // 모바일 감지 (마운트 시 1회)
    const isMobile = typeof window !== 'undefined' && window.innerWidth <= 768;

    // 모바일 무한스크롤
    const loadMoreRef = useRef(null);
    const [isLoadingMore, setIsLoadingMore] = useState(false);
    const [loadMoreError, setLoadMoreError] = useState(false);

    useEffect(() => {
        if (!isMobile || !loadMoreRef.current) return;
        const el = loadMoreRef.current;

        const observer = new IntersectionObserver(
            entries => {
                if (entries[0].isIntersecting && !isLoadingMore && trades.length > 0) {
                    handleLoadMore();
                }
            },
            { threshold: 0.1 }
        );
        observer.observe(el);
        return () => observer.disconnect();
    }); // deps 없음 — isLoadingMore, trades.length 변화 반영

    const handleLoadMore = async () => {
        if (isLoadingMore || trades.length === 0) return;
        const oldestId = trades[trades.length - 1].id;
        setIsLoadingMore(true);
        setLoadMoreError(false);
        try {
            const result = await loadMore(oldestId, 20);
            if (result.length === 0) {
                // 더 이상 없음 — 옵저버 자동 비활성화됨
            }
        } catch {
            setLoadMoreError(true);
        } finally {
            setIsLoadingMore(false);
        }
    };

    // 틱 누적 수량 (페이지 생명주기 동안)
    const [tickTotals, setTickTotals] = useState({ buy: 0, sell: 0 });
    const prevTicksRef = useRef([]);

    useEffect(() => {
        // 재연결 중이면 초기화
        if (isTickConnecting) {
            prevTicksRef.current = [];
            setTickTotals({ buy: 0, sell: 0 });
            return;
        }
        const prev = prevTicksRef.current;
        const current = ticks;
        if (current.length === 0) {
            prevTicksRef.current = current;
            return;
        }
        const added = current.filter(t => !prev.includes(t));
        if (added.length === 0) {
            prevTicksRef.current = current;
            return;
        }
        let buyDelta = 0;
        let sellDelta = 0;
        for (const t of added) {
            const qtyNum = parseFloat(t.quantity ?? '0');
            if (!Number.isFinite(qtyNum) || qtyNum <= 0) continue;
            if (t.isBuyerMaker) {
                sellDelta += qtyNum;
            } else {
                buyDelta += qtyNum;
            }
        }
        if (buyDelta !== 0 || sellDelta !== 0) {
            setTickTotals(prevTotals => ({
                buy: prevTotals.buy + buyDelta,
                sell: prevTotals.sell + sellDelta,
            }));
        }
        prevTicksRef.current = current;
    }, [ticks, isTickConnecting]);

    // 신규 체결 skeleton 표시 (500ms)
    const [newTradeIds, setNewTradeIds] = useState(() => new Set());
    const prevFirstIdRef = useRef(null);
    useEffect(() => {
        if (trades.length === 0) return;
        const firstId = trades[0].id;
        if (prevFirstIdRef.current !== null && firstId !== prevFirstIdRef.current) {
            setNewTradeIds(prev => new Set([...prev, firstId]));
            setTimeout(() => {
                setNewTradeIds(prev => {
                    const next = new Set(prev);
                    next.delete(firstId);
                    return next;
                });
            }, 500);
        }
        prevFirstIdRef.current = firstId;
    }, [trades[0]?.id]); // eslint-disable-line react-hooks/exhaustive-deps

    // ── 스캔 슬롯 ───────────────────────────────────────────
    const scanSlotExpanding = scanState === 'expanding';
    const scanSlotReconnecting = scanState === 'reconnecting';

    return (
        <Layout footerCenter={['SSE', 'TypeScript', 'Binance API', 'shadcn/ui', 'Tailwind CSS']}>
            <div className="min-h-full md:h-full md:overflow-hidden bg-[#0a0f1e] p-4 md:p-8 box-border">
                <div className="max-w-6xl mx-auto md:flex md:flex-col md:gap-2 md:h-full md:overflow-hidden">

                    {/* ── 페이지 헤더 (전체 너비) ───────────────────── */}
                    {(() => {
                        const symbol = trades[0]?.symbol?.replace('USDT', '') ?? 'BTC';
                        return (
                            <div className="relative flex items-center justify-center mb-4">
                                <div className="pointer-events-none select-none">
                                <InputOTP maxLength={symbol.length} value={symbol} readOnly>
                                    <InputOTPGroup>
                                        {Array.from(symbol).map((_, i) => (
                                            <InputOTPSlot
                                                key={i}
                                                index={i}
                                                className="h-12 w-12 text-xl font-bold font-mono text-[#F0B90B] border-[#2B3139] bg-transparent data-[active=true]:ring-0 data-[active=true]:border-[#2B3139] data-[active=true]:shadow-none"
                                            />
                                        ))}
                                    </InputOTPGroup>
                                </InputOTP>
                                </div>
                                <button
                                    onClick={() => setIsPanelOpen(true)}
                                    className="absolute right-0 bg-transparent text-xs text-[#475569] hover:text-[#94a3b8] border border-[#2B3139] rounded px-3 py-1.5 transition-colors"
                                >
                                    조회
                                </button>
                            </div>
                        );
                    })()}

                    {/* ── 초기 로드 실패 ───────────────────────────── */}
                    {initError && (
                        <div className="bg-[#0f172a] border border-red-500/30 rounded-xl p-6 text-center text-[#94a3b8] text-sm">
                            체결 내역을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.
                        </div>
                    )}

                    {/* ── 데스크탑: 2열 (큰거래 | 틱) ─────────────────── */}
                    {!initError && (
                        <div className="hidden md:flex md:flex-1 md:min-h-0 md:gap-2">
                            {/* 좌: 큰거래 테이블 (스캔 슬롯 + 테이블, 스크롤바는 부모로 클리핑) */}
                            <div className="flex-1 min-h-0 flex flex-col bg-[#0f172a] border border-[#1e293b] rounded-2xl overflow-hidden">
                                {/* 스캔 슬롯 */}
                                <div
                                    className={`relative overflow-hidden border-b border-[#1e293b] flex items-center justify-center px-4 h-10 flex-shrink-0 transition-colors duration-500 ${
                                        scanSlotExpanding ? 'bg-blue-950/30' : 'bg-[#0a0f1e]'
                                    }`}
                                >
                                    {scanSlotReconnecting ? (
                                        <span className="text-xs text-yellow-400 font-mono">재연결 중...</span>
                                    ) : (
                                        <>
                                            <span className="text-xs text-[#475569] font-mono tracking-widest select-none">
                                                {scanSlotExpanding ? '● 체결 감지' : '○ 감시중'}
                                            </span>
                                            {!scanSlotExpanding && (
                                                <>
                                                    <span className="text-xs text-[#475569] font-mono tracking-widest ml-2 select-none"> {formatThreshold(threshold)} 이상</span>
                                                    <div
                                                        className={`absolute inset-0 w-1/4 bg-gradient-to-r from-transparent via-blue-400/15 to-transparent pointer-events-none ${styles.scanBeam}`}
                                                    />
                                                </>
                                            )}
                                        </>
                                    )}
                                </div>

                                {/* 테이블 스크롤 영역 (스크롤바는 아래 overflow-hidden이 잘라냄) */}
                                <div className="flex-1 min-h-0 overflow-hidden">
                                    <div className={styles.scrollbarClipWide}>
                                <Table className="table-fixed w-full flex-shrink-0">
                                <TableHeader>
                                    <TableRow className="border-[#1e293b] hover:bg-transparent">
                                        <TableHead className="text-[#475569] text-xs w-24">체결시각</TableHead>
                                        <TableHead className="text-[#475569] text-xs w-20">시장</TableHead>
                                        <TableHead className="text-[#475569] text-xs w-16">방향</TableHead>
                                        <TableHead className="text-[#475569] text-xs text-right">금액(USD)</TableHead>
                                        <TableHead className="text-[#475569] text-xs text-right">금액(원)</TableHead>
                                        <TableHead className="text-[#475569] text-xs text-right">가격(USDT)</TableHead>
                                        <TableHead className="text-[#475569] text-xs text-right w-20">경과</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {trades.length === 0 && !initError && (
                                        <TableRow className="border-[#1e293b] hover:bg-transparent">
                                            <TableCell colSpan={8} className="text-center text-[#475569] text-sm py-12">
                                                체결 감시 중...
                                            </TableCell>
                                        </TableRow>
                                    )}
                                    {trades.map(trade => {
                                        const isNew = newTradeIds.has(trade.id);
                                        const isSell = trade.isBuyerMaker;
                                        return (
                                            <TableRow
                                                key={trade.id}
                                                className={`border-[#1e293b] hover:bg-[#1e293b]/40 transition-colors ${isNew ? styles.newRow : ''}`}
                                            >
                                                {isNew ? (
                                                    <>
                                                        <TableCell className="py-3"><Skeleton className="w-16 bg-[#1e293b] h-4" /></TableCell>
                                                        <TableCell className="py-3"><Skeleton className="w-10 bg-[#1e293b] h-4" /></TableCell>
                                                        <TableCell className="py-3"><Skeleton className="w-8 bg-[#1e293b] h-4" /></TableCell>
                                                        <TableCell className="py-3"><Skeleton className="w-20 ml-auto bg-[#1e293b] h-4" /></TableCell>
                                                        <TableCell className="py-3"><Skeleton className="w-24 ml-auto bg-[#1e293b] h-4" /></TableCell>
                                                        <TableCell className="py-3"><Skeleton className="w-14 ml-auto bg-[#1e293b] h-4" /></TableCell>
                                                        <TableCell className="py-3"><Skeleton className="w-10 ml-auto bg-[#1e293b] h-4" /></TableCell>
                                                    </>
                                                ) : (
                                                    <>
                                                        <TableCell className="text-xs text-[#94a3b8] font-mono py-2.5">
                                                            {formatTime(trade.tradedAt)}
                                                        </TableCell>
                                                        <TableCell className="py-2.5">
                                                            <Badge
                                                                variant="outline"
                                                                className={`text-[10px] px-1.5 py-0 h-4 ${
                                                                    trade.marketType === 'SPOT'
                                                                        ? 'bg-blue-500/10 text-blue-400 border-blue-500/30'
                                                                        : 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                                                                }`}
                                                            >
                                                                {trade.marketType}
                                                            </Badge>
                                                        </TableCell>
                                                        <TableCell className={`text-xs font-semibold py-2.5 ${isSell ? 'text-red-400' : 'text-green-400'}`}>
                                                            {isSell ? '매도' : '매수'}
                                                        </TableCell>
                                                        <TableCell className="text-xs font-mono font-bold text-[#e5e7eb] py-2.5 text-right">
                                                            ${formatWithComma(trade.tradeValue)}
                                                        </TableCell>
                                                        <TableCell className="text-xs font-mono font-bold text-[#e5e7eb] py-2.5 text-right">
                                                            {formatKrw(trade.tradeValue)}
                                                        </TableCell>
                                                        <TableCell className={`text-xs font-mono font-semibold py-2.5 text-right ${isSell ? 'text-red-400' : 'text-green-400'}`}>
                                                            ${formatWithComma(trade.price)}
                                                        </TableCell>
                                                        <TableCell className="text-xs text-[#475569] font-mono py-2.5 text-right">
                                                            {getElapsed(trade.tradedAt)}
                                                        </TableCell>
                                                    </>
                                                )}
                                            </TableRow>
                                        );
                                    })}
                                </TableBody>
                            </Table>
                                    </div>
                                </div>
                            </div>
                            {/* 우: 틱 테이블 (스크롤바 클리핑) */}
                            <div className="w-3/18 min-h-0 flex flex-col flex-shrink-0 border border-[#1e293b] rounded-2xl overflow-hidden bg-[#0f172a]">
                                <div className="h-10 flex-shrink-0 border-b border-[#1e293b] bg-[#0a0f1e] px-3 flex items-center justify-between">
                                <div className="grid grid-cols-2 gap-x-4 text-right leading-tight flex-grow-1">
                                    <span className="text-xs text-[#94a3b8] font-mono text-center">매수 BTC</span>
                                    <span className="text-xs text-[#94a3b8] font-mono text-center">매도 BTC</span>
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
                            <div
                                className={`relative overflow-hidden rounded-xl border flex items-center justify-center px-4 h-10 transition-colors duration-500 ${
                                    scanSlotExpanding ? 'bg-blue-950/30 border-blue-500/30' : 'bg-[#0f172a] border-[#1e293b]'
                                }`}
                            >
                                {scanSlotReconnecting ? (
                                    <span className="text-xs text-yellow-400 font-mono">재연결 중...</span>
                                ) : (
                                    <>
                                        <span className="text-xs text-[#475569] font-mono tracking-widest select-none">
                                            {scanSlotExpanding ? '● 체결 감지' : '○ 감시중'}
                                        </span>
                                        {!scanSlotExpanding && (
                                            <>
                                                <span className="text-xs text-[#475569] font-mono tracking-widest ml-2 select-none"> {formatThreshold(threshold)} 이상</span>
                                                <div
                                                    className={`absolute inset-0 w-1/4 bg-gradient-to-r from-transparent via-blue-400/15 to-transparent pointer-events-none ${styles.scanBeam}`}
                                                />
                                            </>
                                        )}
                                    </>
                                )}
                            </div>

                            {/* 카드 목록 */}
                            {trades.length === 0 && (
                                <div className="text-center text-[#475569] text-sm py-8">
                                    체결 감시 중...
                                </div>
                            )}
                            {trades.map(trade => {
                                const isNew = newTradeIds.has(trade.id);
                                const isSell = trade.isBuyerMaker;
                                return (
                                    <div
                                        key={trade.id}
                                        className={`bg-[#0f172a] border border-[#1e293b] rounded-xl p-3 flex flex-col gap-1.5 ${isNew ? styles.newRow : ''}`}
                                    >
                                        {isNew ? (
                                            <>
                                                <Skeleton className="h-5 w-full bg-[#1e293b]" />
                                                <Skeleton className="h-5 w-2/3 bg-[#1e293b]" />
                                                <Skeleton className="h-5 w-1/2 bg-[#1e293b]" />
                                            </>
                                        ) : (<>
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <Badge
                                                    variant="outline"
                                                    className={`text-[10px] px-1.5 py-0 h-4 ${
                                                        trade.marketType === 'SPOT'
                                                            ? 'bg-blue-500/10 text-blue-400 border-blue-500/30'
                                                            : 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                                                    }`}
                                                >
                                                    {trade.marketType}
                                                </Badge>
                                                <span className={`text-xs font-semibold ${isSell ? 'text-red-400' : 'text-green-400'}`}>
                                                    {isSell ? '매도' : '매수'}
                                                </span>
                                            </div>
                                            <span className="text-xs text-[#475569] font-mono">
                                                {formatTime(trade.tradedAt)}
                                            </span>
                                        </div>
                                        <div className="flex items-baseline justify-between">
                                            <span className={`text-base font-bold font-mono ${isSell ? 'text-red-400' : 'text-green-400'}`}>
                                                ${formatPrice(trade.price)}
                                            </span>
                                            <span className="text-sm font-bold font-mono text-[#e5e7eb]">
                                                {formatValue(trade.tradeValue)}
                                            </span>
                                        </div>
                                        <div className="flex justify-between text-xs text-[#475569] font-mono">
                                            <span>{formatQty(trade.quantity)} BTC</span>
                                            <span>{getElapsed(trade.tradedAt)}</span>
                                        </div>
                                        </>)}
                                    </div>
                                );
                            })}

                            {/* 무한스크롤 shimmer */}
                            {isLoadingMore && (
                                <div className="flex flex-col gap-2">
                                    {[1, 2, 3].map(i => (
                                        <Skeleton key={i} className="h-20 w-full rounded-xl bg-[#1e293b]" />
                                    ))}
                                </div>
                            )}

                            {/* 무한스크롤 실패 */}
                            {loadMoreError && (
                                <div className="flex justify-center py-3">
                                    <button
                                        onClick={handleLoadMore}
                                        className="text-xs text-[#94a3b8] border border-[#334155] rounded-lg px-4 py-2 hover:bg-[#1e293b]"
                                    >
                                        다시 시도
                                    </button>
                                </div>
                            )}

                            {/* IntersectionObserver 트리거 */}
                            <div ref={loadMoreRef} className="h-4" />
                        </div>
                    )}
                </div>
            </div>

            {/* ── 조회 사이드 패널 (Sheet, 제어 방식) ─────────── */}
            <Sheet open={isPanelOpen} onOpenChange={setIsPanelOpen}>
                <SheetContent
                    side="right"
                    aria-describedby={undefined}
                    className="md:w-80 md:sm:w-96 p-0 border-[#1e293b] bg-[#0f172a] md:max-w-96 w-full"
                    showCloseButton={true}
                >
                    <SheetHeader className="px-4 py-3 border-b border-[#1e293b] flex flex-row items-center justify-between">
                        <SheetTitle className="text-[#e5e7eb] text-sm">체결 조회</SheetTitle>
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
