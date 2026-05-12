export function getTickerPanelMinimumSize({
    ticker,
    savedHeight,
    savedWidth,
}) {
    return {
        minHeight: ticker === null && savedHeight ? `${savedHeight}px` : undefined,
        minWidth: ticker === null && savedWidth ? `${savedWidth}px` : undefined,
    };
}
