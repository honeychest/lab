export const getOldestTradeId = (trades) =>
    trades?.length ? trades[trades.length - 1].id : null;

export const shouldLoadMoreTrades = ({ isMobile, isLoadingMore, tradeCount }) =>
    Boolean(isMobile && !isLoadingMore && tradeCount > 0);
