// [AGENT] 실시간 틱 테이블 — F/S, 가격(매수=초록/매도=빨강), 수량 | 연관: useRawTickSse.ts, TradePage.jsx
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/shared/ui/shadcn/table.js';
import { Badge } from '@/shared/ui/shadcn/badge.js';
import { formatWithComma } from '@/shared/lib/utils.js';
import { formatQty } from './model/tradeDisplayModel.js';

/** @param {{ ticks: { price: string, quantity: string, isBuyerMaker: boolean, marketType: string }[], isConnecting: boolean }} props */
export default function TickTable({ ticks, isConnecting }) {
    if (isConnecting) {
        return (
            <div className="flex items-center justify-center py-8 text-xs text-[var(--dark-text-secondary)] font-mono">
                수신중...
            </div>
        );
    }

    if (ticks.length === 0) {
        return (
            <div className="flex items-center justify-center py-8 text-xs text-[var(--dark-text-secondary)] font-mono">
                틱 없음
            </div>
        );
    }

    return (
        <Table className="table-fixed w-full">
            <TableHeader>
                <TableRow className="border-[var(--dark-border)] hover:bg-transparent">
                    <TableHead className="text-[var(--dark-text-secondary)] text-xs w-8 py-1">F/S</TableHead>
                    <TableHead className="text-[var(--dark-text-secondary)] text-xs text-right py-1">가격</TableHead>
                    <TableHead className="text-[var(--dark-text-secondary)] text-xs text-right py-1">수량</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {ticks.map((t, i) => {
                    const isSell = t.isBuyerMaker;
                    const isSpot = (t.marketType || '').toUpperCase() === 'SPOT';
                    const fs = (t.marketType || '').charAt(0);
                    return (
                        <TableRow
                            key={`${t.price}-${t.quantity}-${i}`}
                            className="border-[var(--dark-border)] hover:bg-[#1e293b]/40"
                        >
                            <TableCell className="py-0.5">
                                <Badge
                                    variant="outline"
                                    className={`text-[10px] px-1.5 py-0 h-4 ${
                                        isSpot
                                            ? 'bg-blue-500/10 text-blue-400 border-blue-500/30'
                                            : 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                                    }`}
                                >
                                    {fs}
                                </Badge>
                            </TableCell>
                            <TableCell
                                className={`text-[10px] font-mono font-semibold py-0.5 text-right ${
                                    isSell ? 'text-red-400' : 'text-green-400'
                                }`}
                            >
                                {formatWithComma(t.price)}
                            </TableCell>
                            <TableCell className="text-[10px] font-mono text-[var(--dark-text-neutral)] py-0.5 text-right">
                                {formatQty(t.quantity)}
                            </TableCell>
                        </TableRow>
                    );
                })}
            </TableBody>
        </Table>
    );
}
