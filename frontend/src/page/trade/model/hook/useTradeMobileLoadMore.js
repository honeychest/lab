import { useCallback, useEffect, useRef, useState } from 'react';
import { getOldestTradeId, shouldLoadMoreTrades } from '../tradeLoadMorePolicy.js';

export const useTradeMobileLoadMore = ({ trades, loadMore, isMobile }) => {
    const loadMoreRef = useRef(null);
    const [isLoadingMore, setIsLoadingMore] = useState(false);
    const [loadMoreError, setLoadMoreError] = useState(false);

    const handleLoadMore = useCallback(async () => {
        if (!shouldLoadMoreTrades({ isMobile, isLoadingMore, tradeCount: trades.length })) return;
        const oldestId = getOldestTradeId(trades);
        setIsLoadingMore(true);
        setLoadMoreError(false);
        try {
            await loadMore(oldestId, 20);
        } catch {
            setLoadMoreError(true);
        } finally {
            setIsLoadingMore(false);
        }
    }, [isMobile, isLoadingMore, loadMore, trades]);

    useEffect(() => {
        if (!isMobile || !loadMoreRef.current) return;
        const el = loadMoreRef.current;

        const observer = new IntersectionObserver(
            entries => {
                if (entries[0].isIntersecting && shouldLoadMoreTrades({ isMobile, isLoadingMore, tradeCount: trades.length })) {
                    handleLoadMore();
                }
            },
            { threshold: 0.1 }
        );
        observer.observe(el);
        return () => observer.disconnect();
    }, [handleLoadMore, isLoadingMore, isMobile, trades.length]);

    return {
        loadMoreRef,
        isLoadingMore,
        loadMoreError,
        handleLoadMore,
    };
};
