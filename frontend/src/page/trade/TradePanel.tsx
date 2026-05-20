// [AGENT] 조회 사이드 패널 — 필터(심볼/시장/날짜/정렬) + GET /api/binance/trades 페이지네이션
// 연관파일: TradePage.jsx, BinanceTradeController.java
import { useState } from 'react';
import apiClient from '@/api/apiClient.js';
import { formatPrice, formatValue, getElapsed } from './model/tradeDisplayModel.js';
import { useTradePanelSearch } from './model/hook/useTradePanelSearch.ts';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/shared/ui/shadcn/select';
import { Input } from '@/shared/ui/shadcn/input';
import { Button } from '@/shared/ui/shadcn/button';
import { Badge } from '@/shared/ui/shadcn/badge';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/shared/ui/shadcn/table';

interface TradePanelProps {
    threshold: number | null;
    canEditThreshold?: boolean;
    onThresholdChange: (value: number) => void;
    onClose?: () => void;
}

export default function TradePanel({ threshold, canEditThreshold = false, onThresholdChange, onClose }: TradePanelProps) {
    const [thresholdInput, setThresholdInput] = useState('');
    const [thresholdLoading, setThresholdLoading] = useState(false);

    const handleThresholdApply = async () => {
        const value = Number(thresholdInput);
        if (!value || value <= 0 || !Number.isInteger(value) || value > 10_000_000) return;
        setThresholdLoading(true);
        try {
            const res = await apiClient.post(`/api/binance/trades/threshold?value=${value}`);
            onThresholdChange(res.data.value);
            setThresholdInput('');
        } finally {
            setThresholdLoading(false);
        }
    };

    const {
        symbol, setSymbol,
        marketType, setMarketType,
        from, setFrom,
        to, setTo,
        sort, setSort,
        order, setOrder,
        size,
        result,
        currentPage,
        loading,
        error,
        fetchPage,
        handleSearch,
        handleSizeChange,
        startItem,
        endItem,
    } = useTradePanelSearch();

    return (
        <div className="flex flex-col h-full bg-[var(--dark-card-bg)] text-[var(--dark-text-primary)] overflow-hidden">
            {canEditThreshold && (
                <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--dark-border)]">
                    <span className="text-xs text-[var(--dark-text-secondary)] shrink-0">임계값</span>
                    <span className="text-xs text-[var(--dark-text-neutral)] font-mono shrink-0">
                        {threshold != null ? `${Number(threshold).toLocaleString()} USD` : '...'}
                    </span>
                    <Input
                        type="number"
                        placeholder="변경값 입력"
                        min="1"
                        max="10000000"
                        step="1"
                        value={thresholdInput}
                        onChange={e => setThresholdInput(e.target.value)}
                        onKeyDown={e => {
                            if (['e', 'E', '+', '-', '.'].includes(e.key)) e.preventDefault();
                            if (e.key === 'Enter') handleThresholdApply();
                        }}
                        className="bg-[var(--dark-border)] border-[var(--dark-border-strong)] text-[var(--dark-text-primary)] h-7 text-xs flex-1"
                    />
                    <Button
                        onClick={handleThresholdApply}
                        disabled={thresholdLoading}
                        className="bg-[var(--dark-btn-bg)] hover:bg-[var(--dark-border-strong)] text-[var(--dark-text-neutral)] h-7 text-xs px-3 shrink-0"
                    >
                        적용
                    </Button>
                    {onClose && (
                        <Button
                            onClick={onClose}
                            className="bg-[var(--dark-btn-bg)] hover:bg-[var(--dark-border-strong)] text-[var(--dark-text-neutral)] h-7 text-xs px-3 shrink-0"
                        >
                            닫기
                        </Button>
                    )}
                </div>
            )}

            {/* 필터 영역 */}
            <div className="flex flex-col gap-3 p-4 border-b border-[var(--dark-border)]">
                {/* 심볼 */}
                <div className="flex flex-col gap-1">
                    <label className="text-xs text-[var(--dark-text-neutral)]">심볼</label>
                    <Select value={symbol} onValueChange={setSymbol}>
                        <SelectTrigger className="bg-[var(--dark-border)] border-[var(--dark-border-strong)] text-[var(--dark-text-primary)] h-8 text-sm">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-[var(--dark-border)] border-[var(--dark-border-strong)] text-[var(--dark-text-primary)]">
                            <SelectItem value="BTCUSDT">BTCUSDT</SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                {/* 시장 */}
                <div className="flex flex-col gap-1">
                    <label className="text-xs text-[var(--dark-text-neutral)]">시장</label>
                    <Select value={marketType} onValueChange={setMarketType}>
                        <SelectTrigger className="bg-[var(--dark-border)] border-[var(--dark-border-strong)] text-[var(--dark-text-primary)] h-8 text-sm">
                            <SelectValue placeholder="전체" />
                        </SelectTrigger>
                        <SelectContent className="bg-[var(--dark-border)] border-[var(--dark-border-strong)] text-[var(--dark-text-primary)]">
                            <SelectItem value="ALL">전체</SelectItem>
                            <SelectItem value="SPOT">SPOT</SelectItem>
                            <SelectItem value="FUTURES">FUTURES</SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                {/* 날짜 범위 */}
                <div className="flex gap-2">
                    <div className="flex flex-col gap-1 flex-1">
                        <label className="text-xs text-[var(--dark-text-neutral)]">시작일</label>
                        <Input
                            type="date"
                            value={from}
                            onChange={e => setFrom(e.target.value)}
                            className="bg-[var(--dark-border)] border-[var(--dark-border-strong)] text-[var(--dark-text-primary)] h-8 text-sm"
                        />
                    </div>
                    <div className="flex flex-col gap-1 flex-1">
                        <label className="text-xs text-[var(--dark-text-neutral)]">종료일</label>
                        <Input
                            type="date"
                            value={to}
                            onChange={e => setTo(e.target.value)}
                            className="bg-[var(--dark-border)] border-[var(--dark-border-strong)] text-[var(--dark-text-primary)] h-8 text-sm"
                        />
                    </div>
                </div>

                {/* 정렬 */}
                <div className="flex gap-2">
                    <div className="flex flex-col gap-1 flex-1">
                        <label className="text-xs text-[var(--dark-text-neutral)]">정렬 기준</label>
                        <Select value={sort} onValueChange={setSort}>
                            <SelectTrigger className="bg-[var(--dark-border)] border-[var(--dark-border-strong)] text-[var(--dark-text-primary)] h-8 text-sm">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="bg-[var(--dark-border)] border-[var(--dark-border-strong)] text-[var(--dark-text-primary)]">
                                <SelectItem value="tradedAt">체결시각</SelectItem>
                                <SelectItem value="price">가격</SelectItem>
                                <SelectItem value="quantity">수량</SelectItem>
                                <SelectItem value="tradeValue">금액</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="flex flex-col gap-1 flex-1">
                        <label className="text-xs text-[var(--dark-text-neutral)]">순서</label>
                        <Select value={order} onValueChange={setOrder}>
                            <SelectTrigger className="bg-[var(--dark-border)] border-[var(--dark-border-strong)] text-[var(--dark-text-primary)] h-8 text-sm">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="bg-[var(--dark-border)] border-[var(--dark-border-strong)] text-[var(--dark-text-primary)]">
                                <SelectItem value="DESC">최신순</SelectItem>
                                <SelectItem value="ASC">오래된순</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>

                {/* 건수 + 조회 + 닫기 */}
                <div className="flex items-center justify-between gap-2">
                    <div className="flex gap-1">
                        {[30, 90, 200].map(n => (
                            <Button
                                key={n}
                                type="button"
                                id={`btn-size-${n}`}
                                data-testid={`btn-size-${n}`}
                                variant="ghost"
                                size="sm"
                                onClick={() => handleSizeChange(String(n))}
                                className={`px-2 py-1 text-xs rounded border transition-colors h-auto ${
                                    size === n
                                        ? 'bg-blue-600 border-blue-500 text-white hover:bg-blue-600'
                                        : 'bg-[var(--dark-border)] border-[var(--dark-border-strong)] text-[var(--dark-text-neutral)] hover:border-blue-500'
                                }`}
                            >
                                {n}
                            </Button>
                        ))}
                    </div>
                    <div className="flex gap-1">
                        <Button
                            id="btn-search"
                            data-testid="btn-search"
                            onClick={handleSearch}
                            disabled={loading}
                            className="bg-blue-600 hover:bg-blue-700 text-white h-8 text-sm px-4"
                        >
                            {loading ? '조회 중...' : '조회'}
                        </Button>
                        {onClose && (
                            <Button
                                id="btn-panel-close"
                                data-testid="btn-panel-close"
                                variant="ghost"
                                size="sm"
                                onClick={onClose}
                                className="bg-[var(--dark-btn-bg)] hover:bg-[var(--dark-border-strong)] text-[var(--dark-text-neutral)] h-8 text-sm px-3"
                            >
                                닫기
                            </Button>
                        )}
                    </div>
                </div>
            </div>

            {/* 결과 영역 */}
            <div className="flex-1 overflow-y-auto">
                {/* 에러 */}
                {error && (
                    <div className="flex flex-col items-center gap-3 py-8 text-[var(--dark-text-neutral)]">
                        <span className="text-sm">조회에 실패했습니다</span>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => fetchPage(currentPage)}
                            className="border-[var(--dark-border-strong)] text-[var(--dark-text-neutral)] hover:bg-[var(--dark-border)]"
                        >
                            재시도
                        </Button>
                    </div>
                )}

                {/* 결과 없음 */}
                {!error && result && result.content.length === 0 && (
                    <div className="flex items-center justify-center py-8 text-sm text-[var(--dark-text-neutral)]">
                        체결 내역이 없습니다
                    </div>
                )}

                {/* 결과 테이블 */}
                {!error && result && result.content.length > 0 && (
                    <>
                        <Table>
                            <TableHeader>
                                <TableRow className="border-[var(--dark-border)] hover:bg-transparent">
                                    <TableHead className="text-[var(--dark-text-secondary)] text-xs py-2 flex-1">시장</TableHead>
                                    <TableHead className="text-[var(--dark-text-secondary)] text-xs py-2 text-right flex-1">가격</TableHead>
                                    <TableHead className="text-[var(--dark-text-secondary)] text-xs py-2 text-right flex-1">금액</TableHead>
                                    <TableHead className="text-[var(--dark-text-secondary)] text-xs py-2 text-right w-14">경과</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {result.content.map(row => {
                                    const isSell = row.isBuyerMaker;
                                    return (
                                        <TableRow
                                            key={row.id}
                                            className="border-[var(--dark-border)] hover:bg-[var(--dark-border)]/50"
                                        >
                                            <TableCell className="py-2 flex-1">
                                                <Badge
                                                    className={`text-[10px] px-1.5 py-0 ${
                                                        row.marketType === 'SPOT'
                                                            ? 'bg-blue-500/20 text-blue-400 border-blue-500/30'
                                                            : 'bg-amber-500/20 text-amber-400 border-amber-500/30'
                                                    }`}
                                                    variant="outline"
                                                >
                                                    {row.marketType}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className={`text-xs py-2 text-right font-mono font-semibold flex-1 ${isSell ? 'text-red-400' : 'text-green-400'}`}>
                                                ${formatPrice(row.price)}
                                            </TableCell>
                                            <TableCell className="text-xs py-2 text-right font-mono text-[var(--dark-text-primary)] flex-1">
                                                {formatValue(row.tradeValue)}
                                            </TableCell>
                                            <TableCell className="text-xs py-2 text-right text-[var(--dark-text-secondary)] font-mono w-14">
                                                {getElapsed(row.tradedAt)}
                                            </TableCell>
                                        </TableRow>
                                    );
                                })}
                            </TableBody>
                        </Table>

                        {/* 페이지네이션 */}
                        <div className="flex items-center justify-between px-4 py-3 border-t border-[var(--dark-border)] text-xs text-[var(--dark-text-neutral)]">
                            <span>
                                {startItem}–{endItem} / 총 {result.totalElements.toLocaleString()}건
                            </span>
                            <div className="flex gap-1">
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    disabled={currentPage === 0}
                                    onClick={() => fetchPage(currentPage - 1)}
                                    className="h-7 w-7 p-0 text-[var(--dark-text-neutral)] hover:bg-[var(--dark-border)] disabled:opacity-30"
                                >
                                    ‹
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    disabled={currentPage >= result.totalPages - 1}
                                    onClick={() => fetchPage(currentPage + 1)}
                                    className="h-7 w-7 p-0 text-[var(--dark-text-neutral)] hover:bg-[var(--dark-border)] disabled:opacity-30"
                                >
                                    ›
                                </Button>
                            </div>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
