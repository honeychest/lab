// [AGENT] 조회 사이드 패널 — 필터(심볼/시장/날짜/정렬) + GET /api/binance/trades 페이지네이션
// 연관파일: TradePage.jsx, BinanceTradeController.java
import { useState } from 'react';
import axios from 'axios';
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

interface TradeRow {
    id: number;
    symbol: string;
    marketType: 'SPOT' | 'FUTURES';
    price: string;
    quantity: string;
    tradeValue: string;
    isBuyerMaker: boolean;
    tradedAt: number;
}

interface PageResult {
    content: TradeRow[];
    totalElements: number;
    totalPages: number;
    page: number;
    size: number;
}

const formatPrice = (v: string) =>
    parseFloat(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const formatValue = (v: string) => {
    const n = parseFloat(v);
    if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
    return `$${(n / 1_000).toFixed(0)}K`;
};

const formatTime = (tradedAt: number) =>
    new Date(tradedAt).toLocaleString('ko-KR', {
        timeZone: 'Asia/Seoul',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
    });

interface TradePanelProps {
    threshold: number | null;
    onThresholdChange: (value: number) => void;
}

export default function TradePanel({ threshold, onThresholdChange }: TradePanelProps) {
    const [symbol, setSymbol]         = useState('BTCUSDT');
    const [marketType, setMarketType] = useState('ALL');
    const [from, setFrom]             = useState('');
    const [to, setTo]                 = useState('');
    const [sort, setSort]             = useState('tradedAt');
    const [order, setOrder]           = useState('DESC');
    const [size, setSize]             = useState(30);

    const [thresholdInput, setThresholdInput] = useState('');
    const [thresholdLoading, setThresholdLoading] = useState(false);

    const handleThresholdApply = async () => {
        const value = Number(thresholdInput);
        if (!value || value <= 0 || !Number.isInteger(value) || value > 10_000_000) return;
        setThresholdLoading(true);
        try {
            const res = await axios.post(`/api/binance/trades/threshold?value=${value}`);
            onThresholdChange(res.data.value);
            setThresholdInput('');
        } finally {
            setThresholdLoading(false);
        }
    };

    const [result, setResult]       = useState<PageResult | null>(null);
    const [currentPage, setCurrentPage] = useState(0);
    const [loading, setLoading]     = useState(false);
    const [error, setError]         = useState(false);

    const fetchPage = async (page: number) => {
        setLoading(true);
        setError(false);
        try {
            const params = new URLSearchParams({
                symbol,
                sort,
                order,
                page: String(page),
                size: String(size),
            });
            if (marketType !== 'ALL') params.set('marketType', marketType);
            if (from) params.set('from', from);
            if (to) params.set('to', to);

            const res = await axios.get<PageResult>(`/api/binance/trades?${params}`);
            setResult(res.data);
            setCurrentPage(page);
        } catch {
            setError(true);
        } finally {
            setLoading(false);
        }
    };

    const handleSearch = () => fetchPage(0);

    const handleSizeChange = (val: string) => {
        setSize(Number(val));
        setCurrentPage(0);
        setResult(null);
    };

    const startItem = result ? currentPage * size + 1 : 0;
    const endItem   = result ? Math.min((currentPage + 1) * size, result.totalElements) : 0;

    return (
        <div className="flex flex-col h-full bg-[#0f172a] text-[#e5e7eb] overflow-hidden">
            {/* threshold 변경 */}
            <div className="flex items-center gap-2 px-4 py-3 border-b border-[#1e293b]">
                <span className="text-xs text-[#475569] shrink-0">임계값</span>
                <span className="text-xs text-[#94a3b8] font-mono shrink-0">
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
                    className="bg-[#1e293b] border-[#334155] text-[#e5e7eb] h-7 text-xs flex-1"
                />
                <Button
                    onClick={handleThresholdApply}
                    disabled={thresholdLoading}
                    className="bg-[#2B3139] hover:bg-[#334155] text-[#94a3b8] h-7 text-xs px-3 shrink-0"
                >
                    적용
                </Button>
            </div>

            {/* 필터 영역 */}
            <div className="flex flex-col gap-3 p-4 border-b border-[#1e293b]">
                {/* 심볼 */}
                <div className="flex flex-col gap-1">
                    <label className="text-xs text-[#94a3b8]">심볼</label>
                    <Select value={symbol} onValueChange={setSymbol}>
                        <SelectTrigger className="bg-[#1e293b] border-[#334155] text-[#e5e7eb] h-8 text-sm">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-[#1e293b] border-[#334155] text-[#e5e7eb]">
                            <SelectItem value="BTCUSDT">BTCUSDT</SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                {/* 시장 */}
                <div className="flex flex-col gap-1">
                    <label className="text-xs text-[#94a3b8]">시장</label>
                    <Select value={marketType} onValueChange={setMarketType}>
                        <SelectTrigger className="bg-[#1e293b] border-[#334155] text-[#e5e7eb] h-8 text-sm">
                            <SelectValue placeholder="전체" />
                        </SelectTrigger>
                        <SelectContent className="bg-[#1e293b] border-[#334155] text-[#e5e7eb]">
                            <SelectItem value="ALL">전체</SelectItem>
                            <SelectItem value="SPOT">SPOT</SelectItem>
                            <SelectItem value="FUTURES">FUTURES</SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                {/* 날짜 범위 */}
                <div className="flex gap-2">
                    <div className="flex flex-col gap-1 flex-1">
                        <label className="text-xs text-[#94a3b8]">시작일</label>
                        <Input
                            type="date"
                            value={from}
                            onChange={e => setFrom(e.target.value)}
                            className="bg-[#1e293b] border-[#334155] text-[#e5e7eb] h-8 text-sm"
                        />
                    </div>
                    <div className="flex flex-col gap-1 flex-1">
                        <label className="text-xs text-[#94a3b8]">종료일</label>
                        <Input
                            type="date"
                            value={to}
                            onChange={e => setTo(e.target.value)}
                            className="bg-[#1e293b] border-[#334155] text-[#e5e7eb] h-8 text-sm"
                        />
                    </div>
                </div>

                {/* 정렬 */}
                <div className="flex gap-2">
                    <div className="flex flex-col gap-1 flex-1">
                        <label className="text-xs text-[#94a3b8]">정렬 기준</label>
                        <Select value={sort} onValueChange={setSort}>
                            <SelectTrigger className="bg-[#1e293b] border-[#334155] text-[#e5e7eb] h-8 text-sm">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="bg-[#1e293b] border-[#334155] text-[#e5e7eb]">
                                <SelectItem value="tradedAt">체결시각</SelectItem>
                                <SelectItem value="price">가격</SelectItem>
                                <SelectItem value="quantity">수량</SelectItem>
                                <SelectItem value="tradeValue">금액</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="flex flex-col gap-1 flex-1">
                        <label className="text-xs text-[#94a3b8]">순서</label>
                        <Select value={order} onValueChange={setOrder}>
                            <SelectTrigger className="bg-[#1e293b] border-[#334155] text-[#e5e7eb] h-8 text-sm">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="bg-[#1e293b] border-[#334155] text-[#e5e7eb]">
                                <SelectItem value="DESC">최신순</SelectItem>
                                <SelectItem value="ASC">오래된순</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>

                {/* 건수 */}
                <div className="flex flex-col gap-1">
                    <label className="text-xs text-[#94a3b8]">건수</label>
                    <div className="flex gap-1">
                        {[30, 90, 200].map(n => (
                            <button
                                key={n}
                                type="button"
                                onClick={() => handleSizeChange(String(n))}
                                className={`px-2 py-1 text-xs rounded border transition-colors ${
                                    size === n
                                        ? 'bg-blue-600 border-blue-500 text-white'
                                        : 'bg-[#1e293b] border-[#334155] text-[#94a3b8] hover:border-blue-500'
                                }`}
                            >
                                {n}
                            </button>
                        ))}
                    </div>
                </div>

                {/* 조회 버튼 */}
                <div className="flex justify-end">
                    <Button
                        onClick={handleSearch}
                        disabled={loading}
                        className="bg-blue-600 hover:bg-blue-700 text-white h-8 text-sm px-6"
                    >
                        {loading ? '조회 중...' : '조회'}
                    </Button>
                </div>
            </div>

            {/* 결과 영역 */}
            <div className="flex-1 overflow-y-auto">
                {/* 에러 */}
                {error && (
                    <div className="flex flex-col items-center gap-3 py-8 text-[#94a3b8]">
                        <span className="text-sm">조회에 실패했습니다</span>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => fetchPage(currentPage)}
                            className="border-[#334155] text-[#94a3b8] hover:bg-[#1e293b]"
                        >
                            재시도
                        </Button>
                    </div>
                )}

                {/* 결과 없음 */}
                {!error && result && result.content.length === 0 && (
                    <div className="flex items-center justify-center py-8 text-sm text-[#94a3b8]">
                        체결 내역이 없습니다
                    </div>
                )}

                {/* 결과 테이블 */}
                {!error && result && result.content.length > 0 && (
                    <>
                        <Table>
                            <TableHeader>
                                <TableRow className="border-[#1e293b] hover:bg-transparent">
                                    <TableHead className="text-[#475569] text-xs py-2">시각</TableHead>
                                    <TableHead className="text-[#475569] text-xs py-2">시장</TableHead>
                                    <TableHead className="text-[#475569] text-xs py-2 text-right">가격</TableHead>
                                    <TableHead className="text-[#475569] text-xs py-2 text-right">금액</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {result.content.map(row => {
                                    const isSell = row.isBuyerMaker;
                                    return (
                                        <TableRow
                                            key={row.id}
                                            className="border-[#1e293b] hover:bg-[#1e293b]/50"
                                        >
                                            <TableCell className="text-xs text-[#94a3b8] py-2 font-mono">
                                                {formatTime(row.tradedAt)}
                                            </TableCell>
                                            <TableCell className="py-2">
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
                                            <TableCell className={`text-xs py-2 text-right font-mono font-semibold ${isSell ? 'text-red-400' : 'text-green-400'}`}>
                                                ${formatPrice(row.price)}
                                            </TableCell>
                                            <TableCell className="text-xs py-2 text-right font-mono text-[#e5e7eb]">
                                                {formatValue(row.tradeValue)}
                                            </TableCell>
                                        </TableRow>
                                    );
                                })}
                            </TableBody>
                        </Table>

                        {/* 페이지네이션 */}
                        <div className="flex items-center justify-between px-4 py-3 border-t border-[#1e293b] text-xs text-[#94a3b8]">
                            <span>
                                {startItem}–{endItem} / 총 {result.totalElements.toLocaleString()}건
                            </span>
                            <div className="flex gap-1">
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    disabled={currentPage === 0}
                                    onClick={() => fetchPage(currentPage - 1)}
                                    className="h-7 w-7 p-0 text-[#94a3b8] hover:bg-[#1e293b] disabled:opacity-30"
                                >
                                    ‹
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    disabled={currentPage >= result.totalPages - 1}
                                    onClick={() => fetchPage(currentPage + 1)}
                                    className="h-7 w-7 p-0 text-[#94a3b8] hover:bg-[#1e293b] disabled:opacity-30"
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
