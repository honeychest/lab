import { Badge } from '@/shared/ui/shadcn/badge.js';
import { Skeleton } from '@/shared/ui/shadcn/skeleton.js';
import { Button } from '@/shared/ui/shadcn/button';
import {
    formatTime,
    formatPrice,
    formatQty,
    formatValue,
    getElapsed,
} from './model/tradeDisplayModel.js';
import styles from './TradePage.module.css';

function TradeMobileList({
    trades,
    newTradeIds,
    isLoadingMore,
    loadMoreError,
    onRetryLoadMore,
    loadMoreRef,
}) {
    return (
        <>
            {trades.length === 0 && (
                <div className="text-center text-[var(--dark-text-secondary)] text-sm py-8">
                    체결 감시 중...
                </div>
            )}
            {trades.map(trade => {
                const isNew = newTradeIds.has(trade.id);
                const isSell = trade.isBuyerMaker;
                return (
                    <div
                        key={trade.id}
                        className={`bg-[var(--dark-card-bg)] border border-[var(--dark-border)] rounded-xl p-3 flex flex-col gap-1.5 ${isNew ? styles.newRow : ''}`}
                    >
                        {isNew ? (
                            <>
                                <Skeleton className="h-5 w-full bg-[var(--dark-border)]" />
                                <Skeleton className="h-5 w-2/3 bg-[var(--dark-border)]" />
                                <Skeleton className="h-5 w-1/2 bg-[var(--dark-border)]" />
                            </>
                        ) : (
                            <>
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
                                    <span className="text-xs text-[var(--dark-text-secondary)] font-mono">
                                        {formatTime(trade.tradedAt)}
                                    </span>
                                </div>
                                <div className="flex items-baseline justify-between">
                                    <span className={`text-base font-bold font-mono ${isSell ? 'text-red-400' : 'text-green-400'}`}>
                                        ${formatPrice(trade.price)}
                                    </span>
                                    <span className="text-sm font-bold font-mono text-[var(--dark-text-primary)]">
                                        {formatValue(trade.tradeValue)}
                                    </span>
                                </div>
                                <div className="flex justify-between text-xs text-[var(--dark-text-secondary)] font-mono">
                                    <span>{formatQty(trade.quantity)} BTC</span>
                                    <span>{getElapsed(trade.tradedAt)}</span>
                                </div>
                            </>
                        )}
                    </div>
                );
            })}

            {isLoadingMore && (
                <div className="flex flex-col gap-2">
                    {[1, 2, 3].map(i => (
                        <Skeleton key={i} className="h-20 w-full rounded-xl bg-[var(--dark-border)]" />
                    ))}
                </div>
            )}

            {loadMoreError && (
                <div className="flex justify-center py-3">
                    <Button
                        id="btn-retry-load-more"
                        data-testid="btn-retry-load-more"
                        variant="ghost"
                        size="sm"
                        onClick={onRetryLoadMore}
                        className="text-xs text-[var(--dark-text-neutral)] border border-[var(--dark-border-strong)] rounded-lg px-4 py-2 hover:bg-[var(--dark-border)] h-auto"
                    >
                        다시 시도
                    </Button>
                </div>
            )}

            <div ref={loadMoreRef} className="h-4" />
        </>
    );
}

export default TradeMobileList;
