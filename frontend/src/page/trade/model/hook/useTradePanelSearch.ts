import { useState } from 'react';
import apiClient from '@/api/apiClient.js';

export interface TradeRow {
    id: number;
    symbol: string;
    marketType: 'SPOT' | 'FUTURES';
    price: string;
    quantity: string;
    tradeValue: string;
    isBuyerMaker: boolean;
    tradedAt: number;
}

export interface PageResult {
    content: TradeRow[];
    totalElements: number;
    totalPages: number;
    page: number;
    size: number;
}

const getTodayString = () => new Date().toISOString().split('T')[0];

export function useTradePanelSearch() {
    const [symbol, setSymbol]         = useState('BTCUSDT');
    const [marketType, setMarketType] = useState('ALL');
    const [from, setFrom]             = useState(getTodayString);
    const [to, setTo]                 = useState(getTodayString);
    const [sort, setSort]             = useState('tradedAt');
    const [order, setOrder]           = useState('DESC');
    const [size, setSize]             = useState(30);

    const [result, setResult]           = useState<PageResult | null>(null);
    const [currentPage, setCurrentPage] = useState(0);
    const [loading, setLoading]         = useState(false);
    const [error, setError]             = useState(false);

    const fetchPage = async (page: number) => {
        setLoading(true);
        setError(false);
        try {
            const params = new URLSearchParams({
                symbol, sort, order,
                page: String(page),
                size: String(size),
            });
            if (marketType !== 'ALL') params.set('marketType', marketType);
            if (from) params.set('from', from);
            if (to)   params.set('to', to);

            const res = await apiClient.get<PageResult>(`/api/binance/trades?${params}`);
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

    return {
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
    };
}
