import { Badge } from '@/shared/ui/shadcn/badge.js';
import { Skeleton } from '@/shared/ui/shadcn/skeleton.js';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/shared/ui/shadcn/table.js';
import { formatWithComma } from '@/shared/lib/utils.js';
import {
    formatTime,
    getElapsed,
    formatKrw,
} from './model/tradeDisplayModel.js';

function TradeDesktopTradesTable({ trades, newTradeIds, initError, styles }) {
    return (
        <Table className="table-fixed w-full flex-shrink-0">
            <TableHeader>
                <TableRow className="border-[var(--dark-border)] hover:bg-transparent">
                    <TableHead className="text-[var(--dark-text-secondary)] text-xs w-24">체결시각</TableHead>
                    <TableHead className="text-[var(--dark-text-secondary)] text-xs w-20">시장</TableHead>
                    <TableHead className="text-[var(--dark-text-secondary)] text-xs w-16">방향</TableHead>
                    <TableHead className="text-[var(--dark-text-secondary)] text-xs text-right">금액(USD)</TableHead>
                    <TableHead className="text-[var(--dark-text-secondary)] text-xs text-right">금액(원)</TableHead>
                    <TableHead className="text-[var(--dark-text-secondary)] text-xs text-right">가격(USDT)</TableHead>
                    <TableHead className="text-[var(--dark-text-secondary)] text-xs text-right w-20">경과</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {trades.length === 0 && !initError && (
                    <TableRow className="border-[var(--dark-border)] hover:bg-transparent">
                        <TableCell colSpan={8} className="text-center text-[var(--dark-text-secondary)] text-sm py-12">
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
                            className={`border-[var(--dark-border)] hover:bg-[var(--dark-border)]/40 transition-colors ${isNew ? styles.newRow : ''}`}
                        >
                            {isNew ? (
                                <>
                                    <TableCell className="py-3"><Skeleton className="w-16 bg-[var(--dark-border)] h-4" /></TableCell>
                                    <TableCell className="py-3"><Skeleton className="w-10 bg-[var(--dark-border)] h-4" /></TableCell>
                                    <TableCell className="py-3"><Skeleton className="w-8 bg-[var(--dark-border)] h-4" /></TableCell>
                                    <TableCell className="py-3"><Skeleton className="w-20 ml-auto bg-[var(--dark-border)] h-4" /></TableCell>
                                    <TableCell className="py-3"><Skeleton className="w-24 ml-auto bg-[var(--dark-border)] h-4" /></TableCell>
                                    <TableCell className="py-3"><Skeleton className="w-14 ml-auto bg-[var(--dark-border)] h-4" /></TableCell>
                                    <TableCell className="py-3"><Skeleton className="w-10 ml-auto bg-[var(--dark-border)] h-4" /></TableCell>
                                </>
                            ) : (
                                <>
                                    <TableCell className="text-xs text-[var(--dark-text-neutral)] font-mono py-2.5">
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
                                    <TableCell className="text-xs font-mono font-bold text-[var(--dark-text-primary)] py-2.5 text-right">
                                        ${formatWithComma(trade.tradeValue)}
                                    </TableCell>
                                    <TableCell className="text-xs font-mono font-bold text-[var(--dark-text-primary)] py-2.5 text-right">
                                        {formatKrw(trade.tradeValue)}
                                    </TableCell>
                                    <TableCell className={`text-xs font-mono font-semibold py-2.5 text-right ${isSell ? 'text-red-400' : 'text-green-400'}`}>
                                        ${formatWithComma(trade.price)}
                                    </TableCell>
                                    <TableCell className="text-xs text-[var(--dark-text-secondary)] font-mono py-2.5 text-right">
                                        {getElapsed(trade.tradedAt)}
                                    </TableCell>
                                </>
                            )}
                        </TableRow>
                    );
                })}
            </TableBody>
        </Table>
    );
}

export default TradeDesktopTradesTable;
